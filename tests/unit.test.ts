// Unit tests for the pure pieces the end-to-end tests only reach indirectly: slugs (old ids must keep working),
// the write queue that carries on after a failure, the append log that retries, the lean map, and the socket table.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { legacySlugify, slugCandidates, slugify } from '../server/slug.ts';
import { AppendLog, endLastLine, readLog, WriteQueue } from '../server/store.ts';
import { leanTopic } from '../server/topics.ts';
import { pagesOf, stepMark } from '../ui/src/lib/steps.ts';
import { LEAN_EVIDENCE, type PublicItem, type Session, type Topic } from '../shared/types.ts';

test('slugs: Latin titles keep the ids they always had; other scripts get ids of their own', () => {
  for (const title of ['Café au lait!', 'Differential forms', "Newton's laws", 'How the heart keeps time', 'Gödel']) {
    assert.equal(slugify(title), legacySlugify(title), title);
  }
  assert.equal(slugify('Ἀρετή'), 'αρετη');
  assert.equal(slugify('日本語の文法'), '日本語の文法');
  assert.equal(slugify('Москва — столица'), 'москва-столица');
  assert.equal(slugify('!!!'), 'untitled');
  assert.ok(slugify('x'.repeat(80)).length <= 48);
  // A title whose old id differs is still found under it; "untitled" is never a candidate for another script.
  assert.deepEqual(slugCandidates('Straße'), ['straße', 'stra-e']);
  assert.deepEqual(slugCandidates('Ἀρετή'), ['αρετη']);
});

test('the write queue runs one job at a time per key and carries on after a failure', async () => {
  const queue = new WriteQueue();
  const order: string[] = [];
  const failing = queue.run('a', async () => {
    order.push('fail');
    throw new Error('disk full');
  });
  const next = queue.run('a', async () => {
    order.push('next');
  });
  await assert.rejects(failing, /disk full/);
  await next;
  assert.deepEqual(order, ['fail', 'next']);
  await queue.idle();
});

test('the append log keeps a line the disk refused and writes it with the next one', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aristotle-unit-'));
  try {
    const file = path.join(dir, 'log.jsonl');
    const written: string[] = [];
    const log = new AppendLog('A test log', (f) => written.push(f));
    await log.append(file, { n: 1 });
    await chmod(file, 0o444);
    await assert.rejects(log.append(file, { n: 2 }));
    await chmod(file, 0o644);
    await log.append(file, { n: 3 });
    assert.deepEqual(await readLog(file), [{ n: 1 }, { n: 2 }, { n: 3 }]);
    assert.equal(written.length, 2);
    // A last line torn by a crash is ended, so what comes after it is a line of its own.
    await writeFile(file, `${await readFile(file, 'utf8')}{"n":`);
    await endLastLine(file);
    await log.append(file, { n: 4 });
    assert.deepEqual(await readLog(file), [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the live map carries only the newest evidence of each concept, and says how much there is', () => {
  const evidence = Array.from({ length: LEAN_EVIDENCE + 3 }, (_, i) => ({ at: `2026-01-0${i + 1}`, session: 's', kind: 'quiz' as const }));
  const topic = {
    slug: 't',
    title: 'T',
    goal: '',
    created: '',
    updated: '',
    sessions: [],
    concepts: [
      { id: 'a', label: 'A', status: 'solid', deps: [], firstSeen: '', updated: '', evidence },
      { id: 'b', label: 'B', status: 'unknown', deps: [], firstSeen: '', updated: '', evidence: evidence.slice(0, 2) },
    ],
  } as Topic;
  const lean = leanTopic(topic);
  assert.equal(lean.concepts[0]?.evidence.length, LEAN_EVIDENCE);
  assert.equal(lean.concepts[0]?.evidence.at(-1)?.at, evidence.at(-1)?.at, 'the newest kept');
  assert.equal(lean.concepts[0]?.evidenceTotal, LEAN_EVIDENCE + 3);
  assert.equal(lean.concepts[1]?.evidenceTotal, undefined);
  assert.equal(topic.concepts[0]?.evidence.length, LEAN_EVIDENCE + 3, 'the topic itself is untouched');
});

test('a warm-up that ended its sitting stays with its step when an older sitting picked up again teaches the next', () => {
  const session = (id: string, startedAt: string): Session => ({
    id,
    kind: 'learn',
    topic: 'T',
    topicSlug: 't',
    goal: '',
    startedAt,
  });
  const block = (id: string, kind: 'step' | 'note', at: string): PublicItem => ({ id, type: 'block', kind, markdown: id, at });
  const older = {
    session: session('a', '2026-10-05T00:00:00Z'),
    items: [block('s1', 'step', '2026-10-05T00:01:00Z'), block('s2', 'step', '2026-10-10T10:20:00Z')],
  };
  const warmup = { session: session('b', '2026-10-08T00:00:00Z'), items: [block('w', 'note', '2026-10-08T00:01:00Z')] };
  const pages = pagesOf([older, warmup]);
  assert.deepEqual(
    pages.map((p) => [p.number, p.items.map((i) => i.id)]),
    [
      [1, ['s1', 'w']],
      [2, ['s2']],
    ],
  );
});

test('a finished step stays finished, and a warm-up the class went on without no longer waits', () => {
  const session = (id: string, startedAt: string, endedAt?: string): Session => ({
    id,
    kind: 'learn',
    topic: 'T',
    topicSlug: 't',
    goal: '',
    startedAt,
    ...(endedAt ? { endedAt } : {}),
  });
  const step: PublicItem = { id: 's1', type: 'block', kind: 'step', markdown: '', at: '2026-10-05T00:01:00Z' };
  const quiz: PublicItem = {
    id: 'q',
    type: 'quiz',
    at: '2026-10-05T00:02:00Z',
    questions: [
      { question: 'a', options: ['x', 'y'] },
      { question: 'b', options: ['x', 'y'] },
    ],
    responses: [
      { choice: 0, correct: true },
      { choice: 1, correct: false },
    ],
  };
  const recall: PublicItem = { id: 'r', type: 'ask', kind: 'recall', prompt: 'p', at: '2026-10-06T00:01:00Z' };
  const later: PublicItem = { id: 's2', type: 'block', kind: 'step', markdown: '', at: '2026-10-07T00:00:00Z' };
  const first = (...items: PublicItem[]) => ({ session: session('a', '2026-10-05T00:00:00Z'), items });

  // One answer wrong is still a finished step.
  assert.equal(stepMark(pagesOf([first(step, quiz)])[0]).text, '✓');
  // A sitting that ended in its warm-up still waits on him while nothing came after it...
  const warm = { session: session('b', '2026-10-06T00:00:00Z', '2026-10-06T00:30:00Z'), items: [recall] };
  assert.equal(stepMark(pagesOf([first(step, quiz), warm])[0]).text, 'to answer');
  // ...and no longer once the class went on without it.
  assert.equal(stepMark(pagesOf([first(step, quiz, later), warm])[0]).text, '✓');
});
