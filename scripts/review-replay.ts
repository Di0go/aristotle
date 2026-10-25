// Replays a learning history through the review scheduler, read-only, to see what it would ask of him: the concepts
// due each day, then a simulated stretch of days ahead with the daily cap. It is how the scheduler's rules were
// checked against his real reviews (docs/teaching.md, "Spaced review").
//
//   node scripts/review-replay.ts [data dir]     data/ by default; it never writes there
//   node scripts/review-replay.ts data --days 90 --new 2 --partial 0.5   (new concepts a day; share of partial recalls)
//
// The history is rebuilt from the session logs (status changes on the map) and the practice results on each concept,
// in time order, through the same functions the server uses (server/reviews.ts).

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { becameSolid, gradeReview, retrievability, type Outcome } from '../server/reviews.ts';
import { DAILY_REVIEWS, isReviewSession, reviewDay, type ReviewState } from '../shared/types.ts';

export type HistoryEvent =
  | { at: number; concept: string; kind: 'solid' | 'unsolid' }
  | { at: number; concept: string; kind: 'practice'; outcome: Outcome; review: boolean };

/** One concept as the replay keeps it. */
export interface Card {
  solid: boolean;
  review?: ReviewState;
  /** Days it was asked about in a review. */
  reviewed: string[];
}

/** Every status change and practice result in a data directory, oldest first. */
export function historyEvents(dataDir: string): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  for (const file of readdirSync(path.join(dataDir, 'topics'))) {
    const topic = JSON.parse(readFileSync(path.join(dataDir, 'topics', file), 'utf8'));
    for (const c of topic.concepts) {
      for (const e of c.evidence) {
        if (e.kind !== 'practice' || !e.result) continue;
        events.push({
          at: Date.parse(e.at),
          concept: `${topic.slug}/${c.id}`,
          kind: 'practice',
          outcome: e.result,
          review: isReviewSession(e.session),
        });
      }
    }
  }
  for (const file of readdirSync(path.join(dataDir, 'sessions'))) {
    for (const line of readFileSync(path.join(dataDir, 'sessions', file), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const op = JSON.parse(line);
      if (op.op !== 'add' || op.item?.type !== 'map') continue;
      for (const c of op.item.changes) {
        const concept = `${op.item.topic}/${c.id}`;
        if (c.to === 'solid' && c.from !== 'solid') events.push({ at: Date.parse(op.item.at), concept, kind: 'solid' });
        else if (c.from === 'solid' && c.to && c.to !== 'solid') events.push({ at: Date.parse(op.item.at), concept, kind: 'unsolid' });
      }
    }
  }
  // A wrong practice result makes a solid concept shaky itself (topics.ts); the map change it logs is not a second lapse.
  const sorted = events.sort((a, b) => a.at - b.at);
  return sorted.filter(
    (e) =>
      e.kind !== 'unsolid' ||
      !sorted.some(
        (p) => p.kind === 'practice' && p.concept === e.concept && p.outcome === 'wrong' && e.at - p.at >= 0 && e.at - p.at < 120_000,
      ),
  );
}

/** Applies events to the cards, as topics.ts would have. */
export function replay(events: HistoryEvent[], cards = new Map<string, Card>()): Map<string, Card> {
  for (const e of events) {
    const now = new Date(e.at);
    const card = cards.get(e.concept) ?? { solid: false, reviewed: [] };
    if (e.kind === 'solid') {
      card.review = becameSolid(card.review, now);
      card.solid = true;
    } else if (e.kind === 'unsolid') {
      if (card.solid && card.review) card.review = gradeReview(card.review, 'wrong', now);
      card.solid = false;
    } else if (e.kind === 'practice') {
      if (card.review) card.review = gradeReview(card.review, e.outcome, now);
      if (e.outcome === 'wrong') card.solid = false;
      if (e.review && !card.reviewed.includes(reviewDay(now))) card.reviewed.push(reviewDay(now));
    }
    cards.set(e.concept, card);
  }
  return cards;
}

/** Concepts due at `now`, least likely to be recalled first. */
export function dueAt(cards: Map<string, Card>, now: Date): string[] {
  return [...cards]
    .filter(([, c]) => c.solid && c.review && Date.parse(c.review.due) <= now.getTime())
    .map(([id, c]) => ({ id, r: retrievability(c.review!, now) }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.id);
}

export interface SimDay {
  day: string;
  due: number;
  reviewed: number;
  failed: number;
}

/**
 * Days ahead: each evening he learns `learn` new concepts, then reviews up to the daily cap of what is due. He recalls
 * each with the chance FSRS gives it; a recall is partial with the chance `partial` (half, as in his reviews so far) and
 * clean otherwise, and a failed one is repaired in the same sitting (wrong, then solid again).
 */
export function simulate(
  cards: Map<string, Card>,
  from: Date,
  days: number,
  { learn = 2, cap = DAILY_REVIEWS, partial = 0.5, seed = 1 }: { learn?: number; cap?: number; partial?: number; seed?: number } = {},
): SimDay[] {
  const random = mulberry32(seed);
  const out: SimDay[] = [];
  let n = 0;
  for (let d = 0; d < days; d++) {
    const evening = new Date(from.getFullYear(), from.getMonth(), from.getDate() + d, 19);
    for (let i = 0; i < learn; i++) replay([{ at: evening.getTime(), concept: `new/${n++}`, kind: 'solid' }], cards);
    const due = dueAt(cards, evening);
    let failed = 0;
    const today = due.slice(0, cap);
    for (const [i, id] of today.entries()) {
      const at = evening.getTime() + (i + 1) * 120_000;
      const recalled = random() < retrievability(cards.get(id)!.review!, new Date(at));
      const outcome: Outcome = !recalled ? 'wrong' : random() < partial ? 'partial' : 'right';
      replay([{ at, concept: id, kind: 'practice', outcome, review: true }], cards);
      if (outcome === 'wrong') {
        failed++;
        replay([{ at: at + 60_000, concept: id, kind: 'solid' }], cards);
      }
    }
    out.push({ day: reviewDay(evening), due: due.length, reviewed: today.length, failed });
  }
  return out;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      days: { type: 'string', default: '60' },
      new: { type: 'string', default: '2' },
      partial: { type: 'string', default: '0.5' },
      seeds: { type: 'string', default: '20' },
    },
  });
  const dir = path.resolve(positionals[0] ?? 'data');
  const events = historyEvents(dir);
  const cards = replay(events);
  const start = new Date(Math.min(...events.map((e) => e.at)));
  const today = new Date();

  console.log(`Replayed ${events.length} events on ${cards.size} concepts from ${dir}.\n\nDue each morning (08:00) in his real history:`);
  for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 8); d <= today; d.setDate(d.getDate() + 1)) {
    const upTo = replay(events.filter((e) => e.at <= d.getTime()));
    const due = dueAt(upTo, d).length;
    console.log(`  ${reviewDay(d)}  ${String(due).padStart(3)} due, ${Math.min(due, DAILY_REVIEWS)} today's`);
  }

  console.log('\nConcepts now (solid ones with a card):');
  for (const [id, c] of [...cards].sort()) {
    if (!c.review) continue;
    const next = Math.round((Date.parse(c.review.due) - today.getTime()) / 86_400_000);
    console.log(
      `  ${id.padEnd(58)} ${c.solid ? 'solid' : 'shaky'}  stability ${c.review.stability.toFixed(1).padStart(5)}d  next in ${String(next).padStart(3)}d  lapses ${c.review.lapses}`,
    );
  }

  const days = Number(values.days);
  const runs = Array.from({ length: Number(values.seeds) }, (_, i) =>
    simulate(replay(events), today, days, { learn: Number(values.new), partial: Number(values.partial), seed: i + 1 }),
  );
  const perDay = runs.flatMap((r) => r.map((d) => d.reviewed));
  const duePerDay = runs.flatMap((r) => r.map((d) => d.due));
  console.log(
    `\nAhead, ${days} days, ${values.new} new concepts a day, ${runs.length} runs: ` +
      `${mean(perDay).toFixed(1)} reviews a day on average (most ${Math.max(...perDay)}), ` +
      `${mean(duePerDay).toFixed(1)} due a day, ${mean(runs.flatMap((r) => r.map((d) => d.failed))).toFixed(2)} failed a day.`,
  );
}
