// Unit tests for the pure pieces the end-to-end tests only reach indirectly: slugs (old ids must keep working),
// the write queue that carries on after a failure, the append log that retries, the lean map, the socket table, and the
// review scheduler's rules (replayed with scripts/review-replay.ts, as it replays his real history).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { legacySlugify, slugCandidates, slugify } from '../server/slug.ts';
import { AppendLog, endLastLine, readLog, WriteQueue } from '../server/store.ts';
import { leanTopic } from '../server/topics.ts';
import { pagesOf, stepMark } from '../ui/src/lib/steps.ts';
import { CONCEPT_PIECE } from '../ui/src/lib/concept-piece.ts';
import { becameSolid, gradeReview, isMastered } from '../server/reviews.ts';
import { dueAt, replay, simulate, type HistoryEvent } from '../scripts/review-replay.ts';
import { DAILY_REVIEWS, LEAN_EVIDENCE, reviewsToday, type Concept, type PublicItem, type Session, type Topic } from '../shared/types.ts';

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

test('a concept link is one table piece, whole, label and all; never two links, never across lines', () => {
  // The escaping of "|" inside a table cell is the core's (its markdown.test.ts proves it with this same pattern):
  // what is Aristotle's is the pattern it hands in.
  const pieces = (s: string) => [...s.matchAll(new RegExp(CONCEPT_PIECE.source, 'g'))].map((m) => m[0]);
  assert.deepEqual(pieces('H–H, [[why-atoms-bond|a bond]] and [[chemistry/ions]]'), ['[[why-atoms-bond|a bond]]', '[[chemistry/ions]]']);
  assert.deepEqual(pieces('[[a|b]] | [[c]]'), ['[[a|b]]', '[[c]]']);
  assert.deepEqual(pieces('[[not\nclosed]] [[ [[x]]'), ['[[x]]']);
  assert.equal(CONCEPT_PIECE.source, String.raw`\[\[[^[\]\n]*\]\]`);
});

const DAY = 86_400_000;
/** Noon on day `n` of a made-up history (noon, so no review falls near the 4 a.m. turn of the day). */
const day = (n: number) => new Date(2026, 0, 1 + n, 12).getTime();
const daysUntilDue = (due: string, from: number) => (Date.parse(due) - from) / DAY;

test('reviews: a concept with a clean record goes away for longer each time, and soon for months', () => {
  let at = day(0);
  let card = becameSolid(undefined, new Date(at));
  const gaps: number[] = [];
  for (let i = 0; i < 4; i++) {
    at = Date.parse(card.due);
    card = gradeReview(card, 'right', new Date(at));
    gaps.push(daysUntilDue(card.due, at));
  }
  // Fuzz moves each interval a little; the growth is what matters.
  assert.ok(gaps[0]! >= 20, `after one clean review: ${gaps[0]} days`);
  assert.ok(gaps[1]! >= 90, `after two: ${gaps[1]} days`);
  assert.ok(gaps[2]! > gaps[1]! * 2, `after three: ${gaps[2]} days`);
  assert.ok(isMastered(card));
});

test('reviews: a failed concept comes back within days, and only that one', () => {
  const events: HistoryEvent[] = [
    { at: day(0), concept: 't/a', kind: 'solid' },
    { at: day(0), concept: 't/b', kind: 'solid' },
    { at: day(5), concept: 't/a', kind: 'practice', outcome: 'right', review: true },
    { at: day(5), concept: 't/b', kind: 'practice', outcome: 'wrong', review: true },
    { at: day(5) + 300_000, concept: 't/b', kind: 'solid' }, // repaired in the same sitting
  ];
  const cards = replay(events);
  assert.ok(daysUntilDue(cards.get('t/b')!.review!.due, day(5)) <= 2, 'the failed one is due again within two days');
  assert.ok(daysUntilDue(cards.get('t/a')!.review!.due, day(5)) >= 20, 'the one he got is not');
  assert.deepEqual(dueAt(cards, new Date(day(8))), ['t/b']);
  assert.equal(cards.get('t/b')!.review!.lapses, 1);
});

test('reviews: one grade per concept per day, the worst', () => {
  const start = becameSolid(undefined, new Date(day(0)));
  const at = new Date(day(4));
  const once = gradeReview(start, 'right', at);
  // More answers the same day don't count again: a right one changes nothing, a partial one re-grades the day.
  assert.equal(gradeReview(once, 'right', new Date(day(4) + 60_000)), once);
  const partial = gradeReview(gradeReview(once, 'right', new Date(day(4) + 60_000)), 'partial', new Date(day(4) + 120_000));
  assert.equal(partial.reps, once.reps);
  assert.equal(partial.today, 'partial');
  // A worse one re-grades the day from the morning's card: as if that were the day's only answer.
  const slip = gradeReview(once, 'wrong', new Date(day(4) + 60_000));
  const wrongOnly = gradeReview(start, 'wrong', new Date(day(4) + 60_000));
  assert.equal(slip.reps, start.reps + 1);
  assert.equal(slip.lapses, 1);
  assert.equal(slip.stability, wrongOnly.stability);
  // Becoming solid again after the repair, the same day, leaves the lapse's schedule alone.
  assert.equal(becameSolid(slip, new Date(day(4) + 300_000)), slip);
  // The next day is a new day.
  assert.equal(gradeReview(slip, 'right', new Date(day(5))).reps, slip.reps + 1);
  // Cards stored before these rules (no `today`) are graded as before.
  const { today: _t, before: _b, ...old } = once;
  assert.equal(gradeReview(old, 'right', new Date(day(4) + 60_000)).reps, once.reps + 1);
});

test('reviews: a day asks for at most DAILY_REVIEWS concepts, less those already reviewed', () => {
  const now = day(30);
  const fading = (n: number): Concept => ({
    id: `c${n}`,
    label: `C${n}`,
    status: 'solid',
    deps: [],
    firstSeen: '',
    updated: '',
    evidence: [],
    review: { due: new Date(now - DAY).toISOString(), stability: 3, difficulty: 5, scheduledDays: 3, reps: 2, lapses: 0, state: 2 },
  });
  const concepts = Array.from({ length: 10 }, (_, i) => fading(i));
  assert.equal(reviewsToday(concepts, now), DAILY_REVIEWS);
  const reviewed = (session: string): Concept => ({
    ...fading(99),
    review: { ...fading(99).review!, due: new Date(now + 20 * DAY).toISOString() },
    evidence: [{ at: new Date(now - 3_600_000).toISOString(), session, kind: 'practice', result: 'right', practice: 'recall' }],
  });
  assert.equal(reviewsToday([...concepts, reviewed('2026-01-31-100000000-review')], now), DAILY_REVIEWS - 1);
  assert.equal(
    reviewsToday([...concepts, reviewed('2026-01-31-100000000-spaced-review')], now),
    DAILY_REVIEWS,
    'a lesson on a topic named so is no review',
  );
  assert.equal(reviewsToday(concepts.slice(0, 2), now), 2);
});

test('reviews: simulated months ahead stay under the daily cap', () => {
  const days = simulate(new Map(), new Date(day(0)), 90, { learn: 2, seed: 7 });
  assert.ok(days.every((d) => d.reviewed <= DAILY_REVIEWS));
  const mean = days.slice(30).reduce((a, d) => a + d.reviewed, 0) / 60;
  assert.ok(mean > 2 && mean <= DAILY_REVIEWS, `about ${mean.toFixed(1)} a day`);
});
