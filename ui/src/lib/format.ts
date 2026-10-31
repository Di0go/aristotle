// Dates, times, durations and plurals, written the way the interface shows them: the core's (@organon/core/ui/format,
// where a plain "YYYY-MM-DD" is a day at local noon, never the UTC midnight that is the day before west of Greenwich),
// and Aristotle's own: a day mid-sentence, and a sitting's numbers.

import type { SessionSummary } from '../../../shared/types.ts';

import { formatDay, plural } from '@organon/core/ui/format';

export { ago, asDate, dayKey, duration, formatDay, formatTime, plural } from '@organon/core/ui/format';

/** For use mid-sentence: "today", "yesterday", "on Sun 4 Oct". */
export function onDay(iso: string): string {
  const d = formatDay(iso);
  return d === 'Today' || d === 'Yesterday' ? d.toLowerCase() : `on ${d}`;
}

/**
 * One session's numbers: "Training, 25 min, 3/4 on quizzes, 2 written answers" on a line, or for the log
 * one per line ("25 min", "3 steps", "quizzes 3/4", "2 written answers"), with no training mark.
 */
export function sessionStats(s: SessionSummary, layout: 'line' | 'log' = 'line'): string {
  const time = s.activeMinutes ? `${s.activeMinutes} min` : 'under a minute';
  const asks = s.asks ? plural(s.asks, 'written answer') : '';
  if (layout === 'log') {
    const steps = s.steps ? plural(s.steps, 'step') : '';
    const quizzes = s.quizTotal ? `quizzes ${s.quizRight}/${s.quizTotal}` : '';
    return [time, steps, quizzes, asks].filter(Boolean).join('\n');
  }
  const kind = s.kind === 'train' ? 'Training, ' : '';
  const quizzes = s.quizTotal ? `, ${s.quizRight}/${s.quizTotal} on quizzes` : '';
  return kind + time + quizzes + (asks ? `, ${asks}` : '');
}
