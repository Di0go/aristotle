// Scales for the Progress page's charts: the core's niceTicks (@organon/core/ui/charts/scale), and Aristotle's days and
// weeks as its charts label them.

export { niceTicks } from '@organon/core/ui/charts/scale';

const short = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const long = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** "YYYY-MM-DD" (local) to a Date at local noon. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export const shortDay = (day: string) => short.format(parseDay(day));
export const longDay = (day: string) => long.format(parseDay(day));
export const weekLabel = (week: string) => `Week of ${short.format(parseDay(week))}`;
