// The live session: what the interface shows under "Now", and the session log on disk.
// Each session is an append-only JSON Lines file in data/sessions/, replayed on start.

import { EventEmitter } from 'node:events';
import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
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
  type SessionSummary,
} from '../shared/types.ts';

export type Op =
  | { op: 'session'; session: Session }
  | { op: 'add'; item: Item }
  | { op: 'answer'; id: string; at: string; responses?: QuizResponse[]; response?: string }
  | { op: 'delivered'; id: string }
  | { op: 'end'; at: string; handoff: Handoff };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewItem = DistributiveOmit<Item, 'id' | 'at'>;

export class AnswerError extends Error {}

/** A session rebuilt from its log. */
export interface SessionRecord {
  session: Session | null;
  items: Item[];
  handoff?: Handoff;
  lastAt?: string;
}

export function applyOp(state: SessionRecord, op: Op) {
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

export async function sessionFiles(): Promise<string[]> {
  await mkdir(SESSIONS_DIR, { recursive: true });
  return (await readdir(SESSIONS_DIR)).filter((f) => f.endsWith('.jsonl')).sort();
}

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
    topic: s.topic,
    topicSlug: s.topicSlug ?? slugify(s.topic),
    goal: s.goal,
    startedAt: s.startedAt,
    lastAt: record.lastAt ?? s.startedAt,
    ...(s.endedAt ? { endedAt: s.endedAt } : {}),
    steps: record.items.filter((i) => i.type === 'block' && i.kind === 'step').length,
    quizRight,
    quizTotal,
    asks: record.items.filter((i) => i.type === 'ask' && i.answeredAt).length,
    ...(record.handoff ? { handoff: record.handoff } : {}),
  };
}

export class Feed {
  private record: SessionRecord = { session: null, items: [] };
  readonly events = new EventEmitter<{ event: [FeedEvent] }>();
  private file: string | null = null;
  private writing: Promise<void> = Promise.resolve();
  private waiters = new Map<string, Set<(item: InteractiveItem) => void>>();

  get session() {
    return this.record.session;
  }

  get items() {
    return this.record.items;
  }

  static async load(): Promise<Feed> {
    const feed = new Feed();
    const last = (await sessionFiles()).at(-1);
    if (last) {
      feed.file = path.join(SESSIONS_DIR, last);
      feed.record = await readSession(feed.file);
    }
    return feed;
  }

  private async commit(op: Op) {
    applyOp(this.record, op);
    const file = this.file;
    if (!file) throw new Error('No session file');
    this.writing = this.writing.then(() => appendFile(file, JSON.stringify(op) + '\n'));
    await this.writing;
  }

  private emit(event: FeedEvent) {
    this.events.emit('event', event);
  }

  async startSession(topic: string, topicSlug: string, goal: string): Promise<Session> {
    const now = new Date();
    const session: Session = {
      id: `${stamp(now)}-${topicSlug}`,
      topic,
      topicSlug,
      goal,
      startedAt: now.toISOString(),
    };
    this.file = path.join(SESSIONS_DIR, `${session.id}.jsonl`);
    await mkdir(SESSIONS_DIR, { recursive: true });
    await this.commit({ op: 'session', session });
    this.emit({ type: 'session', session });
    return session;
  }

  async endSession(handoff: Handoff) {
    if (!this.session) return;
    await this.commit({ op: 'end', at: handoff.at, handoff });
    this.emit({ type: 'session', session: this.session });
  }

  async add(fields: NewItem): Promise<Item> {
    if (!this.session) throw new Error('No session: call start_session first.');
    const item = { ...fields, id: randomUUID(), at: new Date().toISOString() } as Item;
    await this.commit({ op: 'add', item });
    this.emit({ type: 'item', item: publicItem(item) });
    return item;
  }

  async answerQuiz(id: string, picks: { choice: number | null; note?: string }[]): Promise<QuizItem> {
    const item = findInteractive(this.items, id);
    if (!item || item.type !== 'quiz') throw new AnswerError('No such quiz');
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

  async answerAsk(id: string, text: string): Promise<AskItem> {
    const item = findInteractive(this.items, id);
    if (!item || item.type !== 'ask') throw new AnswerError('No such question');
    if (item.answeredAt) throw new AnswerError('Already answered');
    if (!text.trim()) throw new AnswerError('Empty answer');
    await this.commit({ op: 'answer', id, at: new Date().toISOString(), response: text });
    this.answered(item);
    return item;
  }

  private answered(item: InteractiveItem) {
    this.emit({ type: 'item', item: publicItem(item) });
    for (const resolve of this.waiters.get(item.id) ?? []) resolve(item);
    this.waiters.delete(item.id);
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

  async markDelivered(id: string) {
    const item = findInteractive(this.items, id);
    if (item && !item.delivered) await this.commit({ op: 'delivered', id });
  }

  /** Answers given in the interface that Claude hasn't received yet. */
  undelivered(): InteractiveItem[] {
    return this.items.filter((i): i is InteractiveItem => isInteractive(i) && Boolean(i.answeredAt) && !i.delivered);
  }

  state(): FeedState {
    return { session: this.session, items: this.items.map(publicItem) };
  }
}

export function publicItem(item: Item): PublicItem {
  if (item.type !== 'quiz' || item.answeredAt) return item;
  return {
    ...item,
    questions: item.questions.map(({ correct: _c, explanation: _e, ...rest }) => rest),
  };
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
