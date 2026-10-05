// The live session: what the interface shows under "Now", and the session log on disk.
// Each session is an append-only JSON Lines file in data/sessions/, replayed on start.

import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { appendFile, mkdir, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { SESSIONS_DIR } from './config.ts';
import { slugify } from './slug.ts';
import {
  isInteractive,
  type AskItem,
  type FeedEvent,
  type FeedState,
  type Handoff,
  type InteractiveItem,
  type Item,
  type PublicItem,
  type QuizItem,
  type QuizResponse,
  type Session,
  type SessionKind,
  type SessionSummary,
} from '../shared/types.ts';

/** One line of a session log. */
export type Op =
  | { op: 'session'; session: Session }
  | { op: 'add'; item: Item }
  | { op: 'answer'; id: string; at: string; responses?: QuizResponse[]; response?: string }
  | { op: 'delivered'; id: string }
  | { op: 'end'; at: string; handoff: Handoff };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewItem = DistributiveOmit<Item, 'id' | 'at'>;

/** A session rebuilt from its log. */
export interface SessionRecord {
  session: Session | null;
  items: Item[];
  handoff?: Handoff;
  lastAt?: string;
}

/** An answer the interface sent that can't be accepted; the API answers it with a 400. */
export class AnswerError extends Error {}

/** A gap between events longer than this means he was away. */
const IDLE_MS = 15 * 60_000;

/** Rebuilds a session from its log file. */
export async function readSession(file: string): Promise<SessionRecord> {
  const state: SessionRecord = { session: null, items: [] };
  const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      applyOp(state, JSON.parse(line) as Op);
    } catch {
      // A torn last line from a crash: skip it, keep the rest.
    }
  }
  return state;
}

/** The session log file names, oldest first (their names start with the date). */
export async function sessionFiles(): Promise<string[]> {
  await mkdir(SESSIONS_DIR, { recursive: true });
  return (await readdir(SESSIONS_DIR)).filter((f) => f.endsWith('.jsonl')).sort();
}

/** The numbers the session list shows; null for a log with no session line. */
export function summarizeSession(record: SessionRecord): SessionSummary | null {
  const s = record.session;
  if (!s) return null;
  let quizRight = 0;
  let quizTotal = 0;
  for (const item of record.items) {
    if (item.type !== 'quiz' || !item.responses) continue;
    quizTotal += item.responses.length;
    quizRight += item.responses.filter((r) => r.correct).length;
  }
  return {
    id: s.id,
    kind: s.kind ?? 'learn',
    topic: s.topic,
    topicSlug: s.topicSlug ?? slugify(s.topic),
    goal: s.goal,
    startedAt: s.startedAt,
    lastAt: record.lastAt ?? s.startedAt,
    ...(s.endedAt ? { endedAt: s.endedAt } : {}),
    steps: record.items.filter((i) => i.type === 'block' && i.kind === 'step').length,
    activeMinutes: activeMinutes(record),
    quizRight,
    quizTotal,
    asks: record.items.filter((i) => i.type === 'ask' && i.answeredAt).length,
    ...(record.handoff ? { handoff: record.handoff } : {}),
  };
}

/** An item as the interface may see it: an unanswered quiz loses its answer key. */
export function publicItem(item: Item): PublicItem {
  if (item.type !== 'quiz' || item.answeredAt) return item;
  return {
    ...item,
    questions: item.questions.map(({ correct: _c, explanation: _e, ...rest }) => rest),
  };
}

/** Something worked out from every session log, kept until that log changes (by its modification time). */
export class SessionCache<T> {
  private entries = new Map<string, { mtime: number; value: T }>();
  private derive: (record: SessionRecord, id: string) => T;

  constructor(derive: (record: SessionRecord, id: string) => T) {
    this.derive = derive;
  }

  /** One value per session, oldest first. */
  async values(): Promise<T[]> {
    const out: T[] = [];
    for (const name of await sessionFiles()) {
      const file = path.join(SESSIONS_DIR, name);
      const mtime = (await stat(file)).mtimeMs;
      let cached = this.entries.get(file);
      if (!cached || cached.mtime !== mtime) {
        cached = { mtime, value: this.derive(await readSession(file), name.replace(/\.jsonl$/, '')) };
        this.entries.set(file, cached);
      }
      out.push(cached.value);
    }
    return out;
  }
}

/** The current session: its items in memory, every change appended to its log and announced on `events`. */
export class Feed {
  readonly events = new EventEmitter<{ event: [FeedEvent] }>();
  private record: SessionRecord = { session: null, items: [] };
  private file: string | null = null;
  /** Appends in order, one after another. */
  private writing: Promise<void> = Promise.resolve();
  /** Tool calls waiting for an answer, by item id. */
  private waiters = new Map<string, Set<(item: InteractiveItem) => void>>();

  get session() {
    return this.record.session;
  }

  get items() {
    return this.record.items;
  }

  /** Picks up the most recent session, so a restart lands where he was. */
  static async load(): Promise<Feed> {
    const feed = new Feed();
    const last = (await sessionFiles()).at(-1);
    if (last) {
      feed.file = path.join(SESSIONS_DIR, last);
      feed.record = await readSession(feed.file);
    }
    return feed;
  }

  /** Opens a new session log; the interface clears "Now" for it. */
  async startSession(topic: string, topicSlug: string, goal: string, kind: SessionKind = 'learn'): Promise<Session> {
    const now = new Date();
    const session: Session = {
      id: `${stamp(now)}-${topicSlug || kind}`,
      kind,
      topic,
      topicSlug,
      goal,
      startedAt: now.toISOString(),
    };
    await mkdir(SESSIONS_DIR, { recursive: true });
    this.file = path.join(SESSIONS_DIR, `${session.id}.jsonl`);
    await this.commit({ op: 'session', session });
    this.emit({ type: 'session', session });
    return session;
  }

  /** Closes the session with its handoff; a no-op when there is none. */
  async endSession(handoff: Handoff) {
    if (!this.session) return;
    await this.commit({ op: 'end', at: handoff.at, handoff });
    this.emit({ type: 'session', session: this.session });
  }

  /** Appends an item to the session and shows it. */
  async add(fields: NewItem): Promise<Item> {
    if (!this.session) throw new Error('No session: call start_session first.');
    const item = { ...fields, id: randomUUID(), at: new Date().toISOString() } as Item;
    await this.commit({ op: 'add', item });
    this.emit({ type: 'item', item: publicItem(item) });
    return item;
  }

  /** The title of the step an item of this session belongs to: the step it is, or the last one shown before it. */
  stepTitleOf(id: string): string | undefined {
    const at = this.items.findIndex((i) => i.id === id);
    for (let i = at; i >= 0; i--) {
      const item = this.items[i];
      if (item.type === 'block' && item.kind === 'step') return item.title;
    }
    return undefined;
  }

  /** Whether a tool call is waiting for this question's answer right now. */
  awaited(id: string): boolean {
    return (this.waiters.get(id)?.size ?? 0) > 0;
  }

  /** Records his picks, one per question, and wakes the waiting tool call. */
  async answerQuiz(id: string, picks: { choice: number | null; note?: string }[]): Promise<QuizItem> {
    const item = findInteractive(this.items, id);
    if (item?.type !== 'quiz') throw new AnswerError('No such quiz');
    if (item.answeredAt) throw new AnswerError('Already answered');
    if (picks.length !== item.questions.length) throw new AnswerError('One pick per question');
    const responses = item.questions.map((q, i): QuizResponse => {
      const { choice, note } = picks[i];
      if (choice !== null && !(Number.isInteger(choice) && choice >= 0 && choice < q.options.length)) {
        throw new AnswerError(`Invalid choice for question ${i + 1}`);
      }
      const trimmed = note?.trim();
      return { choice, correct: choice === q.correct, ...(trimmed ? { note: trimmed } : {}) };
    });
    await this.commit({ op: 'answer', id, at: new Date().toISOString(), responses });
    this.answered(item);
    return item;
  }

  /** Records his written answer and wakes the waiting tool call. */
  async answerAsk(id: string, text: string): Promise<AskItem> {
    const item = findInteractive(this.items, id);
    if (item?.type !== 'ask') throw new AnswerError('No such question');
    if (item.answeredAt) throw new AnswerError('Already answered');
    if (!text.trim()) throw new AnswerError('Empty answer');
    await this.commit({ op: 'answer', id, at: new Date().toISOString(), response: text });
    this.answered(item);
    return item;
  }

  /** Resolves with the answered item, or null on timeout or abort. */
  waitFor(id: string, ms: number, signal?: AbortSignal): Promise<InteractiveItem | null> {
    const item = findInteractive(this.items, id);
    if (!item) return Promise.resolve(null);
    if (item.answeredAt) return Promise.resolve(item);
    return new Promise((resolve) => {
      const set = this.waiters.get(id) ?? new Set();
      this.waiters.set(id, set);
      const done = (value: InteractiveItem | null) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        set.delete(done);
        resolve(value);
      };
      const onAbort = () => done(null);
      const timer = setTimeout(() => done(null), ms);
      signal?.addEventListener('abort', onAbort, { once: true });
      set.add(done);
    });
  }

  /** Notes that Claude has received the answer, so `collect_answers` won't hand it over again. */
  async markDelivered(id: string) {
    const item = findInteractive(this.items, id);
    if (item && !item.delivered) await this.commit({ op: 'delivered', id });
  }

  /** Answers given in the interface that Claude hasn't received yet. */
  undelivered(): InteractiveItem[] {
    return this.items.filter((i): i is InteractiveItem => isInteractive(i) && Boolean(i.answeredAt) && !i.delivered);
  }

  /** The whole current session, as the interface loads it. */
  state(): FeedState {
    return { session: this.session, items: this.items.map(publicItem) };
  }

  /** Applies a change in memory, then appends it to the log. */
  private async commit(op: Op) {
    const file = this.file;
    if (!file) throw new Error('No session file');
    applyOp(this.record, op);
    this.writing = this.writing.then(() => appendFile(file, `${JSON.stringify(op)}\n`));
    await this.writing;
  }

  private emit(event: FeedEvent) {
    this.events.emit('event', event);
  }

  private answered(item: InteractiveItem) {
    this.emit({ type: 'item', item: publicItem(item) });
    for (const resolve of this.waiters.get(item.id) ?? []) resolve(item);
    this.waiters.delete(item.id);
  }
}

/** Replays one log line onto the session it rebuilds. */
function applyOp(state: SessionRecord, op: Op) {
  switch (op.op) {
    case 'session':
      state.session = op.session;
      state.items = [];
      state.handoff = undefined;
      state.lastAt = op.session.startedAt;
      break;
    case 'add':
      state.items.push(op.item);
      state.lastAt = op.item.at;
      break;
    case 'answer': {
      const item = findInteractive(state.items, op.id);
      if (!item) break;
      item.answeredAt = op.at;
      if (item.type === 'quiz') item.responses = op.responses;
      else item.response = op.response;
      state.lastAt = op.at;
      break;
    }
    case 'delivered': {
      const item = findInteractive(state.items, op.id);
      if (item) item.delivered = true;
      break;
    }
    case 'end':
      state.handoff = op.handoff;
      if (state.session) state.session.endedAt = op.at;
      state.lastAt = op.at;
      break;
  }
}

function findInteractive(items: Item[], id: string): InteractiveItem | undefined {
  const item = items.find((i) => i.id === id);
  return item && isInteractive(item) ? item : undefined;
}

/** Minutes between the session's events, leaving out gaps long enough to mean he was away. */
function activeMinutes(record: SessionRecord): number {
  const times = [record.session!.startedAt, record.session!.endedAt];
  for (const item of record.items) {
    times.push(item.at);
    if (isInteractive(item)) times.push(item.answeredAt);
  }
  const ms = times
    .filter((t): t is string => Boolean(t))
    .map(Date.parse)
    .sort((a, b) => a - b);
  let total = 0;
  for (let i = 1; i < ms.length; i++) {
    const gap = ms[i] - ms[i - 1];
    if (gap <= IDLE_MS) total += gap;
  }
  return Math.round(total / 60_000);
}

/** Local date and time down to the millisecond, so session files sort in the order they were started. */
function stamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`;
}
