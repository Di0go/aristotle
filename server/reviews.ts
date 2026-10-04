// Spaced review of concepts with FSRS: every solid concept carries a review card; when its due date
// passes, the concept is "fading" until he practises it again.

import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs';
import type { ReviewState } from '../shared/types.ts';

// Days, not minutes: concepts are reviewed across sessions, not drilled within one.
const scheduler = fsrs({ request_retention: 0.9, enable_fuzz: true, enable_short_term: false });

export type Outcome = 'right' | 'partial' | 'wrong';

const GRADE: Record<Outcome, Grade> = { right: Rating.Good, partial: Rating.Hard, wrong: Rating.Again };

function toCard(r: ReviewState): Card {
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

/** A new card, reviewed once at the moment the concept became solid. */
export function startReview(now: Date): ReviewState {
  return fromCard(scheduler.next(createEmptyCard(now), now, Rating.Good).card);
}

export function gradeReview(state: ReviewState, outcome: Outcome, now: Date): ReviewState {
  return fromCard(scheduler.next(toCard(state), now, GRADE[outcome]).card);
}

/** Probability he would recall it now, 0 to 1. */
export function retrievability(state: ReviewState, now: Date): number {
  return scheduler.get_retrievability(toCard(state), now, false);
}
