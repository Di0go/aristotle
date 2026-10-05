// Dates, times, durations and plurals, written the way the interface shows them.

import type { SessionSummary } from '../../../shared/types.ts';

const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const dayYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

/** "Today", "Yesterday", "Sun 4 Oct", or "4 Oct 2025" for other years. */
export function formatDay(iso: string): string {
  const d = new Date(iso);
  const days = daysAgo(iso);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.getFullYear() === new Date().getFullYear() ? day.format(d) : dayYear.format(d);
}

/** "14:05". */
export function formatTime(iso: string): string {
  return time.format(new Date(iso));
}

/** For use mid-sentence: "today", "yesterday", "on Sun 4 Oct". */
export function onDay(iso: string): string {
  const d = formatDay(iso);
  return d === 'Today' || d === 'Yesterday' ? d.toLowerCase() : `on ${d}`;
}

/** "today", "yesterday", "3 days ago", "5 weeks ago". */
export function ago(iso: string): string {
  const days = daysAgo(iso);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

/** "under a minute", "25 min", "1 h 10 min". */
export function duration(fromIso: string, toIso: string): string {
  const min = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000));
  if (min < 1) return 'under a minute';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

/** "1 concept", "3 concepts"; irregular plurals are passed in. */
export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

/** A local date as YYYY-MM-DD, the form the server keys days and weeks by. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

/** Calendar days between that day and today, counted midnight to midnight (not 24-hour spans). */
function daysAgo(iso: string): number {
  return Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000);
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
