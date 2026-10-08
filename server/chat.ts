// The chat beside a lesson: the learner talks with Aristotle (a second Claude Code on their own login, beside the
// tutor, or the model API when Settings say so) while they read, about anything. Each message carries what they are
// looking at, so it always knows where they are; it answers at once even while a question waits for them, and never
// moves the lesson. One conversation per class (and one for everywhere else), kept in data/chats/<thread>.jsonl
// (appended to, never rewritten) and continued as one Claude Code session, or sent with its recent messages to the
// API; the tutor reads it.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { CHATS_DIR, ONESHOT_CMD } from './config.ts';
import { complete, type LlmMessage } from './llm.ts';
import { claudeCwd, claudeEnv, headlessArgs, limited, useApi } from './oneshot.ts';
import { settings } from './settings.ts';
import { slugCandidates, slugify } from './slug.ts';
import { AppendLog, endLastLine, isObject, loadJsonDir, readLog } from './store.ts';
import type { ChatMessage, ChatThread } from '../shared/types.ts';

const TIMEOUT_MS = 180_000;
/** Marks, between the runner and send(), an answer he stopped. */
const STOPPED = '\u0000stopped';
const MAX_MESSAGE = 8000;
const MAX_CONTEXT = 12_000;
/** Messages of the chat so far sent with each new one to the model API (Claude Code keeps its own session). */
const API_HISTORY = 20;

const SYSTEM =
  'You are Aristotle, talking with a learner beside their lesson in the Aristotle app. A separate tutor runs the lesson; ' +
  'you are the companion they can talk to about anything while they read. Each of their messages comes with what they are looking ' +
  'at right now (the class, the step, its text, their answers and notes) and what they hold on the class map: use it, so they ' +
  'never have to explain where they are. Answer like a knowledgeable friend: accurate, plain, as short as the question allows, ' +
  'longer when they want depth. If they are working something out, help them think rather than handing it over, and never give ' +
  'away the answer to a check they have not answered yet: give hints and questions instead. Say plainly when you are not sure ' +
  "or when something is contested. Plain Markdown; maths as $...$. Answer in the language they write in. Don't teach the " +
  "lesson's next step or change their map; if they want that, tell them the lesson will get there. " +
  'They can tag a step, a concept or a class with @ ("@Step 2 · …"); what they tagged comes with their message: use it.';

export class ChatError extends Error {}

/** One line of a chat's log: a message, the Claude Code session it continues, or the chat started over. */
type ChatOp = { op: 'message'; message: ChatMessage } | { op: 'session'; session?: string } | { op: 'clear' };

/** A message as it streams: the thread, the answer's id, and the text added since the last delta. */
export interface ChatDelta {
  thread: string;
  id: string;
  delta: string;
}

export class Chats {
  private threads = new Map<string, ChatThread>();
  private busy = new Set<string>();
  /** The Claude Code answering in each thread right now, so he can stop it. */
  private running = new Map<string, { kill: () => void; stopped: boolean }>();
  private log = new AppendLog('A chat');
  readonly events = new EventEmitter<{ message: [string, ChatMessage]; delta: [ChatDelta]; cleared: [string] }>();

  /** Each chat: its log replayed, on top of the whole-file <thread>.json chats were kept in before (never rewritten). */
  static async load(): Promise<Chats> {
    const store = new Chats();
    for (const t of await loadJsonDir(CHATS_DIR, isThread)) store.threads.set(t.thread, t);
    for (const name of (await readdir(CHATS_DIR)).filter((f) => f.endsWith('.jsonl'))) {
      const file = path.join(CHATS_DIR, name);
      await endLastLine(file);
      const id = name.slice(0, -'.jsonl'.length);
      const t = store.threads.get(id) ?? { thread: id, messages: [] };
      for (const op of (await readLog(file)) as ChatOp[]) {
        if (op.op === 'message') t.messages.push(op.message);
        else if (op.op === 'session') t.session = op.session;
        else if (op.op === 'clear') {
          t.messages = [];
          t.session = undefined;
        }
      }
      store.threads.set(id, t);
    }
    return store;
  }

  /** A thread's messages, oldest first. */
  get(thread: string): ChatMessage[] {
    return this.threads.get(this.idOf(thread))?.messages ?? [];
  }

  /** Resolves once every write queued so far has finished. */
  idle(): Promise<void> {
    return this.log.idle();
  }

  /** The id a thread is kept under: its slug now, or before Unicode slugs if it was started then. */
  private idOf(thread: string): string {
    const id = threadId(thread);
    if (this.threads.has(id) || !thread.trim()) return id;
    return slugCandidates(thread).find((s) => this.threads.has(s)) ?? id;
  }

  /** Stops the answer being written in a thread; what was written so far is kept, marked stopped. */
  cancel(thread: string): boolean {
    const run = this.running.get(this.idOf(thread));
    if (!run) return false;
    run.stopped = true;
    run.kill();
    return true;
  }

  /** Starts a thread over: its messages and its Claude Code session are forgotten. */
  async clear(thread: string) {
    const id = this.idOf(thread);
    this.cancel(id);
    const t: ChatThread = { thread: id, messages: [] };
    this.threads.set(id, t);
    await this.write(id, { op: 'clear' });
    this.events.emit('cleared', id);
  }

  /** His message, then Aristotle's answer, streamed as it is written (`delta` events) and kept. */
  async send(thread: string, text: string, context: string, mentions: string[] = []): Promise<ChatMessage> {
    const id = this.idOf(thread);
    const body = text.trim().slice(0, MAX_MESSAGE);
    if (!body) throw new ChatError('Write something first');
    if (this.busy.has(id)) throw new ChatError('Aristotle is still answering your last message');
    this.busy.add(id);
    try {
      const t = this.threads.get(id) ?? { thread: id, messages: [] };
      this.threads.set(id, t);
      const tagged = mentions.filter((m) => body.includes(m)).slice(0, 20);
      const mine: ChatMessage = {
        id: randomUUID(),
        role: 'user',
        text: body,
        at: new Date().toISOString(),
        ...(tagged.length ? { mentions: tagged } : {}),
      };
      t.messages.push(mine);
      this.events.emit('message', id, mine);
      await this.write(id, { op: 'message', message: mine });
      const sessionBefore = t.session;

      const answerId = randomUUID();
      const request = `${context.slice(0, MAX_CONTEXT)}\n\nTheir message: ${body}`;
      let answer: string;
      const onDelta = (delta: string) => this.events.emit('delta', { thread: id, id: answerId, delta });
      try {
        answer = await this.ask(t, request, onDelta);
      } catch (err) {
        if (!(err instanceof ChatError) || !t.session || this.running.get(id)?.stopped) throw err;
        // The saved session is gone (Claude Code's own store was cleared, or it ran in another folder): start a new
        // one, with the recent talk.
        t.session = undefined;
        answer = await this.ask(t, `${recap(t.messages.slice(0, -1))}${request}`, onDelta);
      }
      const stopped = answer.endsWith(STOPPED);
      const theirs: ChatMessage = {
        id: answerId,
        role: 'assistant',
        text: stopped ? answer.slice(0, -STOPPED.length).trim() : answer,
        at: new Date().toISOString(),
        ...(stopped ? { stopped: true } : {}),
      };
      // Started over while the answer was being written: it belongs to the chat that was cleared, so it is not kept.
      if (this.threads.get(id) !== t) return theirs;
      t.messages.push(theirs);
      this.events.emit('message', id, theirs);
      if (t.session !== sessionBefore) await this.write(id, { op: 'session', session: t.session });
      await this.write(id, { op: 'message', message: theirs });
      return theirs;
    } finally {
      this.busy.delete(id);
    }
  }

  /** Asks the model API, with the thread's recent messages, streaming each new piece of text to `onDelta`. */
  private askApi(t: ChatThread, request: string, onDelta: (delta: string) => void): Promise<string> {
    return limited(async () => {
      const abort = new AbortController();
      const run = { kill: () => abort.abort(), stopped: false };
      this.running.set(t.thread, run);
      let text = '';
      try {
        // The messages before his new one (already in the thread), without the context each was sent with.
        const history: LlmMessage[] = t.messages
          .slice(0, -1)
          .slice(-API_HISTORY)
          .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
        const answer = await complete(settings.helperEndpoint(), SYSTEM, request, {
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(TIMEOUT_MS)]),
          history,
          onText: (piece) => {
            text += piece;
            onDelta(piece);
          },
        });
        if (!answer) throw new ChatError('Aristotle gave an empty answer');
        return answer;
      } catch (err) {
        if (run.stopped) return `${text.trim()}${STOPPED}`;
        if (err instanceof ChatError) throw err;
        throw new ChatError(
          `Aristotle could not answer: ${(err as Error).name === 'TimeoutError' ? 'it took too long' : (err as Error).message}`,
        );
      } finally {
        if (this.running.get(t.thread) === run) this.running.delete(t.thread);
      }
    });
  }

  /** Runs Claude Code on the thread's session (resumed, or a new one), streaming each new piece of text to `onDelta`. */
  private ask(t: ChatThread, request: string, onDelta: (delta: string) => void): Promise<string> {
    if (useApi()) return this.askApi(t, request, onDelta);
    const resume = Boolean(t.session);
    const session = t.session ?? randomUUID();
    // Always the same private folder (oneshot.ts claudeCwd), so a session can be resumed.
    const [file = 'claude', ...rest] = ONESHOT_CMD
      ? ONESHOT_CMD.split(' ')
      : [
          'claude',
          ...headlessArgs(SYSTEM, [
            resume ? '--resume' : '--session-id',
            session,
            '--output-format',
            'stream-json',
            '--verbose',
            '--include-partial-messages',
          ]),
        ];
    return limited(async () => {
      const cwd = await claudeCwd();
      return new Promise<string>((resolve, reject) => {
        const child = spawn(file, rest, { cwd, stdio: ['pipe', 'pipe', 'pipe'], timeout: TIMEOUT_MS, env: claudeEnv() });
        const run = { kill: () => child.kill('SIGTERM'), stopped: false };
        this.running.set(t.thread, run);
        let buffer = '';
        let text = '';
        let plain = '';
        let err = '';
        child.stdout.on('data', (d) => {
          buffer += d;
          let nl = buffer.indexOf('\n');
          while (nl !== -1) {
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            nl = buffer.indexOf('\n');
            let ev: { type?: string; event?: { type?: string; delta?: { type?: string; text?: string } } };
            try {
              ev = JSON.parse(line);
            } catch {
              // Not Claude Code's stream (a stand-in command in the tests): its plain output is the answer.
              plain += `${line}\n`;
              continue;
            }
            const delta = ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' ? ev.event.delta : undefined;
            if (delta?.type === 'text_delta' && delta.text) {
              text += delta.text;
              onDelta(delta.text);
            }
          }
        });
        child.stderr.on('data', (d) => (err += d));
        child.on('error', (e) => reject(new ChatError(`Could not start Claude Code: ${e.message}`)));
        child.on('close', (code, signal) => {
          if (this.running.get(t.thread) === run) this.running.delete(t.thread);
          const answer = (text || plain + buffer).trim();
          // Stopped by him: keep what was written (the session may not have it, so it is started over next time).
          if (run.stopped) {
            t.session = code === 0 ? session : undefined;
            return resolve(`${answer}${STOPPED}`);
          }
          if (code === 0 && answer) {
            t.session = session;
            return resolve(answer);
          }
          if (signal) return reject(new ChatError('Aristotle took too long to answer'));
          reject(new ChatError(`Aristotle could not answer${err.trim() ? `: ${err.trim().split('\n').at(-1)}` : ''}`));
        });
        // A child that exits before reading all of a long request must not take the server down with EPIPE.
        child.stdin.on('error', () => {});
        child.stdin.end(request);
      });
    });
  }

  /** Appends one change to the thread's log (store.ts AppendLog). */
  private write(thread: string, op: ChatOp): Promise<void> {
    return this.log.append(path.join(CHATS_DIR, `${thread}.jsonl`), op);
  }
}

/** A class's slug, or "home" for talk away from any class. */
export function threadId(thread: string): string {
  return thread.trim() ? slugify(thread) : 'home';
}

/** The shape a chat file must have to be loaded. */
function isThread(v: unknown): v is ChatThread {
  return isObject(v) && typeof v.thread === 'string' && Array.isArray(v.messages);
}

/** The last few exchanges, for a session started over. */
function recap(messages: ChatMessage[]): string {
  const last = messages.slice(-10);
  if (!last.length) return '';
  return `Our conversation so far:\n${last.map((m) => `${m.role === 'user' ? 'Learner' : 'You'}: ${m.text}`).join('\n')}\n\n`;
}
