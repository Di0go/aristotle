// The chat beside a lesson: he talks with Aristotle (a second Claude Code on his own login, beside the tutor) while
// he reads, about anything. Each message carries what he is looking at, so it always knows where he is; it answers
// at once even while a question waits for him, and never moves the lesson. One conversation per class (and one for
// everywhere else), kept in data/chats/<thread>.json and continued as one Claude Code session; the tutor reads it.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CHATS_DIR, ONESHOT_CMD, ONESHOT_MODEL, STATE_DIR } from './config.ts';
import { claudeEnv } from './oneshot.ts';
import { slugify } from './slug.ts';
import type { ChatMessage, ChatThread } from '../shared/types.ts';

const TIMEOUT_MS = 180_000;
const MAX_MESSAGE = 8000;
const MAX_CONTEXT = 12_000;
/** A neutral folder for its sessions: no project's CLAUDE.md, the same one every time so sessions can resume. */
const CWD = path.join(STATE_DIR, 'chat');

const SYSTEM =
  'You are Aristotle, talking with a learner beside his lesson in the Aristotle app. A separate tutor runs the lesson; ' +
  'you are the companion he can talk to about anything while he reads. Each of his messages comes with what he is looking ' +
  'at right now (the class, the step, its text, his answers and notes) and what he holds on the class map: use it, so he ' +
  'never has to explain where he is. Answer like a knowledgeable friend: accurate, plain, as short as the question allows, ' +
  'longer when he wants depth. If he is working something out, help him think rather than handing it over, and never give ' +
  'away the answer to a check he has not answered yet: give hints and questions instead. Say plainly when you are not sure ' +
  "or when something is contested. Plain Markdown; maths as $...$. Answer in the language he writes in. Don't teach the " +
  "lesson's next step or change his map; if he wants that, tell him the lesson will get there.";

export class ChatError extends Error {}

/** A message as it streams: the thread, the answer's id, and the text so far. */
export interface ChatDelta {
  thread: string;
  id: string;
  text: string;
}

export class Chats {
  private threads = new Map<string, ChatThread>();
  private busy = new Set<string>();
  private saving = new Map<string, Promise<void>>();
  readonly events = new EventEmitter<{ message: [string, ChatMessage]; delta: [ChatDelta] }>();

  static async load(): Promise<Chats> {
    const store = new Chats();
    await mkdir(CHATS_DIR, { recursive: true });
    for (const file of await readdir(CHATS_DIR)) {
      if (!file.endsWith('.json')) continue;
      const t = JSON.parse(await readFile(path.join(CHATS_DIR, file), 'utf8')) as ChatThread;
      store.threads.set(t.thread, t);
    }
    return store;
  }

  /** A thread's messages, oldest first. */
  get(thread: string): ChatMessage[] {
    return this.threads.get(threadId(thread))?.messages ?? [];
  }

  /** His message, then Aristotle's answer, streamed as it is written (`delta` events) and kept. */
  async send(thread: string, text: string, context: string): Promise<ChatMessage> {
    const id = threadId(thread);
    const body = text.trim().slice(0, MAX_MESSAGE);
    if (!body) throw new ChatError('Write something first');
    if (this.busy.has(id)) throw new ChatError('Aristotle is still answering your last message');
    this.busy.add(id);
    try {
      const t = this.threads.get(id) ?? { thread: id, messages: [] };
      this.threads.set(id, t);
      const mine: ChatMessage = { id: randomUUID(), role: 'user', text: body, at: new Date().toISOString() };
      t.messages.push(mine);
      this.events.emit('message', id, mine);
      await this.write(t);

      const answerId = randomUUID();
      const request = `${context.slice(0, MAX_CONTEXT)}\n\nHis message: ${body}`;
      let answer: string;
      try {
        answer = await this.ask(t, request, (so) => this.events.emit('delta', { thread: id, id: answerId, text: so }));
      } catch (err) {
        if (!(err instanceof ChatError) || !t.session) throw err;
        // The saved session is gone (Claude Code's own store was cleared): start a new one, with the recent talk.
        t.session = undefined;
        answer = await this.ask(t, `${recap(t.messages.slice(0, -1))}${request}`, (so) =>
          this.events.emit('delta', { thread: id, id: answerId, text: so }),
        );
      }
      const theirs: ChatMessage = { id: answerId, role: 'assistant', text: answer, at: new Date().toISOString() };
      t.messages.push(theirs);
      this.events.emit('message', id, theirs);
      await this.write(t);
      return theirs;
    } finally {
      this.busy.delete(id);
    }
  }

  /** Runs Claude Code on the thread's session (resumed, or a new one), streaming its text to `onText`. */
  private ask(t: ChatThread, request: string, onText: (soFar: string) => void): Promise<string> {
    const resume = Boolean(t.session);
    const session = t.session ?? randomUUID();
    const args = ONESHOT_CMD
      ? ONESHOT_CMD.split(' ')
      : [
          'claude',
          '-p',
          '--model',
          ONESHOT_MODEL,
          '--tools',
          '',
          '--strict-mcp-config',
          '--setting-sources',
          '',
          resume ? '--resume' : '--session-id',
          session,
          '--output-format',
          'stream-json',
          '--verbose',
          '--include-partial-messages',
          '--system-prompt',
          SYSTEM,
        ];
    const [file, ...rest] = args;
    return mkdir(CWD, { recursive: true }).then(
      () =>
        new Promise<string>((resolve, reject) => {
          const child = spawn(file, rest, { cwd: CWD, stdio: ['pipe', 'pipe', 'pipe'], timeout: TIMEOUT_MS, env: claudeEnv() });
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
                onText(text);
              }
            }
          });
          child.stderr.on('data', (d) => (err += d));
          child.on('error', (e) => reject(new ChatError(`Could not start Claude Code: ${e.message}`)));
          child.on('close', (code, signal) => {
            const answer = (text || plain + buffer).trim();
            if (code === 0 && answer) {
              t.session = session;
              return resolve(answer);
            }
            if (signal) return reject(new ChatError('Aristotle took too long to answer'));
            reject(new ChatError(`Aristotle could not answer${err.trim() ? `: ${err.trim().split('\n').at(-1)}` : ''}`));
          });
          child.stdin.end(request);
        }),
    );
  }

  /** Atomic write (temp file + rename), one at a time per thread. */
  private async write(t: ChatThread) {
    const file = path.join(CHATS_DIR, `${t.thread}.json`);
    const next = (this.saving.get(t.thread) ?? Promise.resolve()).then(async () => {
      await writeFile(`${file}.tmp`, `${JSON.stringify(t, null, 2)}\n`);
      await rename(`${file}.tmp`, file);
    });
    this.saving.set(t.thread, next);
    await next;
  }
}

/** A class's slug, or "home" for talk away from any class. */
export function threadId(thread: string): string {
  return slugify(thread) || 'home';
}

/** The last few exchanges, for a session started over. */
function recap(messages: ChatMessage[]): string {
  const last = messages.slice(-10);
  if (!last.length) return '';
  return `Our conversation so far:\n${last.map((m) => `${m.role === 'user' ? 'He' : 'You'}: ${m.text}`).join('\n')}\n\n`;
}
