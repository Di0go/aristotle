// His questions on a passage ("Ask about this"): asked beside a step, answered by Claude Code on his own login
// (oneshot.ts) without interrupting the class, and kept with the step. All of them in one file, data/asides.json.

import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ASIDES_FILE } from './config.ts';
import { OneshotError, oneshot } from './oneshot.ts';
import { slugify } from './slug.ts';
import type { Aside, AsideBody } from '../shared/types.ts';

const MAX_PASSAGE = 1500;
const MAX_QUESTION = 1000;
const MAX_CONTEXT = 2000;

const SYSTEM =
  'You are a tutor answering a side question a learner asked about a passage of their lesson, without taking over the lesson. ' +
  'Read their question about the words they selected in the sense the paragraph gives them, and answer exactly that, accurately, in 2 to 6 sentences (under 140 words) of plain Markdown; inline maths as $...$. ' +
  'Start with the answer: no preamble, no restating the question, no headings, no follow-up offers. Plain words over jargon. ' +
  'Answer in the language they asked in. If the answer is uncertain or contested, say so briefly instead of sounding sure. ' +
  'If the honest answer is that the next steps of the lesson cover it, say that in one sentence and give the short version.';

export class AsideError extends Error {}

export class Asides {
  private asides: Aside[] = [];
  private saving: Promise<void> = Promise.resolve();
  readonly events = new EventEmitter<{ asides: [Aside[]] }>();

  static async load(): Promise<Asides> {
    const store = new Asides();
    try {
      store.asides = JSON.parse(await readFile(ASIDES_FILE, 'utf8')) as Aside[];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    return store;
  }

  /** Oldest first. */
  all(): Aside[] {
    return this.asides;
  }

  /** The questions he asked while reading a topic. */
  of(topic: string): Aside[] {
    return this.asides.filter((a) => a.topic === topic);
  }

  /** Asks Claude Code, keeps the question with its answer, and returns it. */
  async ask(body: AsideBody, context: { topicTitle?: string; step?: string }): Promise<Aside> {
    const passage = body.passage.replace(/\s+/g, ' ').trim().slice(0, MAX_PASSAGE);
    const question = body.question.trim().slice(0, MAX_QUESTION);
    const around = body.context?.replace(/\s+/g, ' ').trim().slice(0, MAX_CONTEXT);
    if (!question) throw new AsideError('Write your question first');
    const request = [
      context.topicTitle ? `Lesson: ${context.topicTitle}` : '',
      context.step ? `Step: ${context.step}` : '',
      around && around !== passage ? `The paragraph it is in: "${around}"` : '',
      passage ? `The words they selected: "${passage}"` : '',
      `Their question: ${question}`,
    ]
      .filter(Boolean)
      .join('\n');
    let answer: string;
    try {
      answer = await oneshot(SYSTEM, request);
    } catch (err) {
      if (err instanceof OneshotError) throw new AsideError(err.message);
      throw err;
    }
    const aside: Aside = {
      id: randomUUID(),
      ...(body.topic ? { topic: slugify(body.topic) } : {}),
      ...(body.item ? { item: body.item } : {}),
      passage,
      question,
      answer,
      at: new Date().toISOString(),
    };
    this.asides = [...this.asides, aside];
    await this.write();
    return aside;
  }

  async remove(id: string): Promise<boolean> {
    const before = this.asides.length;
    this.asides = this.asides.filter((a) => a.id !== id);
    if (this.asides.length === before) return false;
    await this.write();
    return true;
  }

  /** Atomic write (temp file + rename), one at a time. */
  private async write() {
    const list = this.asides;
    this.saving = this.saving.then(async () => {
      await mkdir(path.dirname(ASIDES_FILE), { recursive: true });
      const tmp = `${ASIDES_FILE}.tmp`;
      await writeFile(tmp, `${JSON.stringify(list, null, 2)}\n`);
      await rename(tmp, ASIDES_FILE);
    });
    await this.saving;
    this.events.emit('asides', list);
  }
}
