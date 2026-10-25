// Spaced review of concepts with FSRS: every solid concept carries a review card; when its due date
// passes, the concept is "fading" until he practises it again. Why FSRS, and the rules around it, are in
// docs/teaching.md ("Spaced review").

import { createEmptyCard, fsrs, Rating, type State, type Card, type Grade } from 'ts-fsrs';
import { reviewDay, type ReviewOutcome, type ReviewState } from '../shared/types.ts';

export type Outcome = ReviewOutcome;

/**
 * The chance of recall each review is timed for. Below FSRS's usual 0.9: these are written checks on ideas, not flash
 * cards, a slip gets repaired on the spot, and the reviews it saves go to new material. Simulated from his history
 * (scripts/review-replay.ts), 0.85 asks for about a quarter fewer reviews than 0.9 (docs/teaching.md).
 */
export const RETENTION = 0.85;

/** A concept this stable whose last review was clean is mastered: a one-line check is enough. */
export const MASTERED_DAYS = 30;

// Days, not minutes: concepts are reviewed across sessions, not drilled within one.
const scheduler = fsrs({ request_retention: RETENTION, enable_fuzz: true, enable_short_term: false });

const GRADE: Record<Outcome, Grade> = { right: Rating.Good, partial: Rating.Hard, wrong: Rating.Again };
const RANK: Record<Outcome, number> = { wrong: 0, partial: 1, right: 2 };

/** A new card, reviewed once at the moment the concept became solid. */
function startReview(now: Date): ReviewState {
  return { ...fromCard(scheduler.next(createEmptyCard(now), now, Rating.Good).card), today: 'right' };
}

/**
 * The card after one more review with this outcome. One grade per concept per day: a second result on the same day (a
 * re-check, a repair, another question on it) moves the card only if it is worse than the day's so far, and then the
 * day is graded again from the card as it was that morning. Without this, three questions on one concept in a sitting
 * counted as three reviews, and a slip in the third undid weeks of growth.
 */
export function gradeReview(state: ReviewState, outcome: Outcome, now: Date): ReviewState {
  if (state.today && state.last && reviewDay(state.last) === reviewDay(now)) {
    if (RANK[outcome] >= RANK[state.today]) return state;
    const morning = state.before ? toCard(state.before) : createEmptyCard(new Date(state.last));
    return { ...fromCard(scheduler.next(morning, now, GRADE[outcome]).card), today: outcome, ...keep(state.before) };
  }
  return { ...fromCard(scheduler.next(toCard(state), now, GRADE[outcome]).card), today: outcome, before: core(state) };
}

/**
 * The card when the concept becomes solid: a new one, or a successful review of the old one. A day that already
 * graded it (a repair after a slip) keeps the day's result.
 */
export function becameSolid(state: ReviewState | undefined, now: Date): ReviewState {
  if (!state) return startReview(now);
  return gradedToday(state, now) ? state : gradeReview(state, 'right', now);
}

/** Whether he already had a result on this card today. */
function gradedToday(state: ReviewState, now: Date): boolean {
  return Boolean(state.today && state.last && reviewDay(state.last) === reviewDay(now));
}

/** Probability he would recall it now, 0 to 1. */
export function retrievability(state: ReviewState, now: Date): number {
  return scheduler.get_retrievability(toCard(state), now, false);
}

/** Stable for a month or more, and the last review was clean. */
export function isMastered(state: ReviewState): boolean {
  return state.stability >= MASTERED_DAYS && state.today !== 'wrong' && state.today !== 'partial';
}

// The stored card keeps only what FSRS needs to schedule the next review, with ISO dates so it reads well
// in JSON; these convert it to and from ts-fsrs's own shape.

function toCard(r: Omit<ReviewState, 'today' | 'before'>): Card {
  return {
    due: new Date(r.due),
    stability: r.stability,
    difficulty: r.difficulty,
    elapsed_days: 0,
    scheduled_days: r.scheduledDays,
    learning_steps: 0,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state as State,
    ...(r.last ? { last_review: new Date(r.last) } : {}),
  };
}

function fromCard(c: Card): ReviewState {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    scheduledDays: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    ...(c.last_review ? { last: c.last_review.toISOString() } : {}),
  };
}

/** The card without the day's bookkeeping, as it stands before a new day's review. */
function core({ today: _t, before: _b, ...card }: ReviewState): NonNullable<ReviewState['before']> {
  return card;
}

function keep(before: ReviewState['before']) {
  return before ? { before } : {};
}
