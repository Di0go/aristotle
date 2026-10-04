/** A rounded maximum and evenly spaced ticks from 0, e.g. 0 / 5 / 10 / 15 / 20. */
export function niceTicks(max: number, count = 4): { max: number; ticks: number[] } {
  if (max <= 0) return { max: 1, ticks: [0, 1] };
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const nice = Math.max(1, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= nice + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { max: nice, ticks };
}

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
