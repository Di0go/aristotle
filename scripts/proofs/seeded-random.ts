// Preloaded into both servers of a differential (node --import): Math.random and crypto.randomInt from a fixed seed,
// so what is shuffled (a quiz's options) comes out in the same order on both sides, given the same requests in the
// same order. Ids (randomUUID) stay random: the differential blanks them.
//
// And the fuzz of the review schedules (ts-fsrs) seeded by the card alone, without the time of the review: its seed is
// `${time}_${reps}_${difficulty * stability}`, with the time to the millisecond, so the same code, asked a few
// milliseconds later on the other side, scheduled 64 days where the first said 59 (an A/A run). The fuzz still runs;
// it is the same library on both sides (ts-fsrs 5.4.2 in both lockfiles), patched alike, and the patch must apply.

import crypto from 'node:crypto';
import { registerHooks, syncBuiltinESMExports } from 'node:module';

const FROM = 'const time = this.review_time.getTime();';
registerHooks({
  load(url, context, next) {
    const out = next(url, context);
    if (!/\/ts-fsrs\/dist\/index\.mjs$/.test(url)) return out;
    const src = String(out.source);
    if (!src.includes(FROM)) throw new Error('seeded-random.ts: ts-fsrs no longer seeds its fuzz as expected; update the patch');
    return { ...out, source: src.replace(FROM, 'const time = 0;') };
  },
});

let seed = 0x9e3779b9;
/** mulberry32: a float in [0, 1). */
function next(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
Math.random = next;
(crypto as { randomInt: unknown }).randomInt = (a: number, b?: number) => {
  const [min, max] = b === undefined ? [0, a] : [a, b];
  return min + Math.floor(next() * (max - min));
};
syncBuiltinESMExports();
