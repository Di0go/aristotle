// A class as he reads it: one page per step, in order, whatever sitting each was taught in. Sessions are how
// the tutor keeps its record; here they disappear. The first page is the intro (orientation, what he already
// knew, the plan); checks at the start of a later sitting are the warm-up of the step that follows them; the
// summary that closes a sitting is left out (the class page says where he is instead).

import type { PublicItem, Session } from '../../../shared/types.ts';

export interface Checks {
  right: number;
  wrong: number;
  dontKnow: number;
  unanswered: number;
  written: number;
}

export interface ClassPage {
  /** 0 for the intro, then each step's number. */
  number: number;
  title?: string;
  /** Checks on what came before, asked when a sitting began, before this step was taught. */
  warmup: PublicItem[];
  /** The step itself, then its checks, feedback and map changes. */
  items: PublicItem[];
  checks: Checks;
  /** Taught (or being warmed up for) in the session running now. */
  live: boolean;
  /** Only a warm-up so far: the step itself is still to come. */
  upcoming: boolean;
}

export interface SessionRecord {
  session: Session;
  items: PublicItem[];
}

/**
 * "2. Wired and broadcast" or "Step 3 · The fast arm" → the title alone: Aristotle numbers steps across the whole
 * class, so a number Claude wrote (often from its plan) would only disagree with it.
 */
export const cleanTitle = (t?: string) => t?.replace(/^\s*(step\s*)?\d+\s*[.:)·—–-]\s*/i, '') || undefined;

/** The pages of a class from its lesson sessions, oldest first; `liveId` is the session running now, if any. */
export function pagesOf(sessions: SessionRecord[], liveId?: string): ClassPage[] {
  const pages: ClassPage[] = [];
  let step = 0;
  for (const { session, items } of sessions) {
    if (session.kind !== 'learn') continue;
    const live = session.id === liveId;
    /** What a sitting shows before its first step: the intro in the first one, a warm-up in later ones. */
    let before: PublicItem[] = [];
    let current: ClassPage | undefined;
    for (const item of items) {
      if (item.type === 'block' && item.kind === 'summary') continue;
      if (item.type === 'block' && item.kind === 'step') {
        // What came before the class's very first step is its intro; before a later sitting's first step, a warm-up.
        const first = step === 0;
        if (first && before.length) pages.push({ ...page(0, undefined, live), items: before });
        step++;
        current = page(step, cleanTitle(item.title), live);
        if (!first) current.warmup = before;
        before = [];
        pages.push(current);
      }
      if (current) current.items.push(item);
      else before.push(item);
    }
    if (!before.length) continue;
    if (step === 0) {
      // A first sitting that hasn't reached a step yet: all of it is the intro.
      pages.push({ ...page(0, undefined, live), items: before });
    } else if (live) {
      // Warming up for a step not taught yet: a page of its own, until the step arrives.
      pages.push({ ...page(step + 1, undefined, true), warmup: before, upcoming: true });
    } else {
      // A sitting that ended in its warm-up: it stays with the step it went back over.
      pages.at(-1)!.items.push(...before);
    }
  }
  for (const p of pages) for (const item of [...p.warmup, ...p.items]) tally(p.checks, item);
  return pages;
}

/**
 * One mark for how a page went, the same in the tree and on the class page: ✓ when every check is answered and
 * none went wrong (a written answer counts as done), right out of graded when one went wrong, "to answer" while a
 * question waits, nothing when it has no checks (or is the intro).
 */
export function stepMark(p: ClassPage): { text: string; tone: '' | 'done' | 'mixed' | 'todo'; title?: string } {
  const c = p.checks;
  const graded = c.right + c.wrong + c.dontKnow;
  if (c.unanswered) return { text: 'to answer', tone: 'todo' };
  // The intro's checks find out what he knew before the class: nothing to score.
  if (p.number === 0) return { text: '', tone: '' };
  if (graded > c.right) return { text: `${c.right}/${graded}`, tone: 'mixed', title: `${c.right} of ${graded} right` };
  if (graded || c.written) return { text: '✓', tone: 'done', title: 'Done' };
  return { text: '', tone: '' };
}

/** "Intro", or "Step 3". */
export function pageLabel(p: ClassPage): string {
  return p.number === 0 ? 'Intro' : `Step ${p.number}`;
}

function page(number: number, title: string | undefined, live: boolean): ClassPage {
  return {
    number,
    title,
    warmup: [],
    items: [],
    checks: { right: 0, wrong: 0, dontKnow: 0, unanswered: 0, written: 0 },
    live,
    upcoming: false,
  };
}

/** Counts an item's checks: graded picks by outcome, written answers, and what is still open. */
function tally(c: Checks, item: PublicItem) {
  if (item.type === 'quiz') {
    for (const [i] of item.questions.entries()) {
      const r = item.responses?.[i];
      if (!r) c.unanswered++;
      else if (r.choice === null) c.dontKnow++;
      else if (r.correct) c.right++;
      else c.wrong++;
    }
  } else if (item.type === 'ask') {
    if (item.answeredAt) c.written++;
    else c.unanswered++;
  }
}
