// Splits a session's items into the parts of a class (orientation, probe, plan, each step with its checks,
// summary) and tallies each part's checks, so a long class can be read as an outline and opened part by part.

import type { PublicItem } from '../../../shared/types.ts';

export type SectionKind = 'orient' | 'probe' | 'plan' | 'step' | 'summary' | 'notes';

export interface Section {
  /** Stable within the session: the id of the item that opens it. */
  key: string;
  kind: SectionKind;
  /** "Step 2", "What you already knew"… */
  label: string;
  title?: string;
  items: PublicItem[];
  /** The step's number, for steps. */
  step?: number;
  checks: { right: number; wrong: number; dontKnow: number; unanswered: number; written: number };
}

const LABELS: Record<SectionKind, string> = {
  orient: 'Before we start',
  probe: 'What you already knew',
  plan: 'The plan',
  step: 'Step',
  summary: 'Summary',
  notes: 'Notes',
};

/** "2. Wired and broadcast" → "Wired and broadcast": the label carries the number. */
const cleanTitle = (t?: string) => t?.replace(/^\s*(step\s*)?\d+[.:)]\s*/i, '') || undefined;

/** The parts of a class, in order, each with its items and how its checks went. */
export function sectionsOf(items: PublicItem[]): Section[] {
  const out: Section[] = [];
  let step = 0;
  let current: Section | undefined;
  const open = (kind: SectionKind, item: PublicItem, title?: string) => {
    if (kind === 'step') step++;
    current = {
      key: item.id,
      kind,
      label: kind === 'step' ? `Step ${step}` : LABELS[kind],
      title: cleanTitle(title),
      items: [],
      ...(kind === 'step' ? { step } : {}),
      checks: { right: 0, wrong: 0, dontKnow: 0, unanswered: 0, written: 0 },
    };
    out.push(current);
  };

  for (const item of items) {
    if (item.type === 'block' && ['orient', 'plan', 'step', 'summary'].includes(item.kind)) {
      open(item.kind as SectionKind, item, item.kind === 'step' ? item.title : undefined);
    } else if (!current || (current.kind === 'orient' && (item.type === 'quiz' || item.type === 'ask'))) {
      // Checks before any teaching are the probe: finding out what he already holds.
      open(item.type === 'block' ? 'notes' : 'probe', item);
    }
    current!.items.push(item);
    tally(current!, item);
  }
  return out;
}

/**
 * Which parts start open: where to pick up (the first part with an unanswered check, or else the last step)
 * and the last summary. Everything else is folded to one line.
 */
export function openByDefault(sections: Section[]): Set<string> {
  const keys = new Set<string>();
  const resume = sections.find((s) => s.checks.unanswered > 0) ?? sections.findLast((s) => s.kind === 'step');
  if (resume) keys.add(resume.key);
  const summary = sections.findLast((s) => s.kind === 'summary');
  if (summary) keys.add(summary.key);
  return keys;
}

/** Counts an item's checks into its part: graded picks by outcome, written answers, and what is still open. */
function tally(s: Section, item: PublicItem) {
  if (item.type === 'quiz') {
    for (const [i] of item.questions.entries()) {
      const r = item.responses?.[i];
      if (!r) s.checks.unanswered++;
      else if (r.choice === null) s.checks.dontKnow++;
      else if (r.correct) s.checks.right++;
      else s.checks.wrong++;
    }
  } else if (item.type === 'ask') {
    if (item.answeredAt) s.checks.written++;
    else s.checks.unanswered++;
  }
}
