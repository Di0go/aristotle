// The live session: what the interface shows under "Now", and the session log on disk.
// Each session is an append-only JSON Lines file in data/sessions/, replayed on start.

import { EventEmitter } from 'node:events';
import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { SESSIONS_DIR } from './config.ts';
import type {
  AskItem,
  FeedEvent,
  FeedState,
  Item,
  PublicItem,
  QuizItem,
  QuizResponse,
  Session,
} from '../shared/types.ts';

type Op =
  | { op: 'session'; session: Session }
  | { op: 'add'; item: Item }
  | { op: 'answer'; id: string; at: string; responses?: QuizResponse[]; response?: string }
  | { op: 'delivered'; id: string };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewItem = DistributiveOmit<Item, 'id' | 'at'>;
type Interactive = QuizItem | AskItem;

export class AnswerError extends Error {}

export class Feed {
  session: Session | null = null;
  items: Item[] = [];
  readonly events = new EventEmitter<{ event: [FeedEvent] }>();
  private file: string | null = null;
  private writing: Promise<void> = Promise.resolve();
  private waiters = new Map<string, Set<(item: Interactive) => void>>();

  static async load(): Promise<Feed> {
    const feed = new Feed();
    await mkdir(SESSIONS_DIR, { recursive: true });
    const files = (await readdir(SESSIONS_DIR)).filter((f) => f.endsWith('.jsonl')).sort();
    const last = files.at(-1);
    if (last) await feed.replay(path.join(SESSIONS_DIR, last));
    return feed;
  }

  private async replay(file: string) {
    this.file = file;
    const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        this.apply(JSON.parse(line) as Op);
      } catch {
        // A torn last line from a crash: skip it, keep the rest.
      }
    }
  }

  private apply(op: Op) {
    switch (op.op) {
      case 'session':
        this.session = op.session;
        this.items = [];
        break;
      case 'add':
        this.items.push(op.item);
        break;
      case 'answer': {
        const item = this.interactive(op.id);
        if (!item) break;
        item.answeredAt = op.at;
        if (item.type === 'quiz') item.responses = op.responses;
        else item.response = op.response;
        break;
      }
      case 'delivered': {
        const item = this.interactive(op.id);
        if (item) item.delivered = true;
        break;
      }
    }
  }

  private async commit(op: Op) {
    this.apply(op);
    const file = this.file;
    if (!file) throw new Error('No session file');
    this.writing = this.writing.then(() => appendFile(file, JSON.stringify(op) + '\n'));
    await this.writing;
  }

  private emit(event: FeedEvent) {
    this.events.emit('event', event);
  }

  private interactive(id: string): Interactive | undefined {
    const item = this.items.find((i) => i.id === id);
    return item && item.type !== 'block' ? item : undefined;
  }

  async startSession(topic: string, goal: string): Promise<Session> {
    const now = new Date();
    const session: Session = {
      id: `${stamp(now)}-${slugify(topic)}`,
      topic,
      goal,
      startedAt: now.toISOString(),
    };
    this.file = path.join(SESSIONS_DIR, `${session.id}.jsonl`);
    await this.commit({ op: 'session', session });
    this.emit({ type: 'session', session });
    return session;
  }

  async add(fields: NewItem): Promise<Item> {
    if (!this.session) await this.startSession('Unsorted', 'No session was started');
    const item = { ...fields, id: randomUUID(), at: new Date().toISOString() } as Item;
    await this.commit({ op: 'add', item });
    this.emit({ type: 'item', item: publicItem(item) });
    return item;
  }

  async answerQuiz(id: string, picks: { choice: number | null; note?: string }[]): Promise<QuizItem> {
    const item = this.interactive(id);
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
    const item = this.interactive(id);
    if (!item || item.type !== 'ask') throw new AnswerError('No such question');
    if (item.answeredAt) throw new AnswerError('Already answered');
    if (!text.trim()) throw new AnswerError('Empty answer');
    await this.commit({ op: 'answer', id, at: new Date().toISOString(), response: text });
    this.answered(item);
    return item;
  }

  private answered(item: Interactive) {
    this.emit({ type: 'item', item: publicItem(item) });
    for (const resolve of this.waiters.get(item.id) ?? []) resolve(item);
    this.waiters.delete(item.id);
  }

  /** Resolves with the answered item, or null on timeout or abort. */
  waitFor(id: string, ms: number, signal?: AbortSignal): Promise<Interactive | null> {
    const item = this.interactive(id);
    if (!item) return Promise.resolve(null);
    if (item.answeredAt) return Promise.resolve(item);
    return new Promise((resolve) => {
      const set = this.waiters.get(id) ?? new Set();
      this.waiters.set(id, set);
      const done = (value: Interactive | null) => {
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
    const item = this.interactive(id);
    if (item && !item.delivered) await this.commit({ op: 'delivered', id });
  }

  /** Answers given in the interface that Claude hasn't received yet. */
  undelivered(): Interactive[] {
    return this.items.filter(
      (i): i is Interactive => i.type !== 'block' && Boolean(i.answeredAt) && !i.delivered,
    );
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

export function slugify(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'session'
  );
}
