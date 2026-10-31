// Preloaded into both servers of a differential (node --import): Math.random and crypto.randomInt from a fixed seed,
// so what is shuffled (a quiz's options) comes out in the same order on both sides, given the same requests in the
// same order. Ids (randomUUID) stay random: the differential blanks them.

import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';

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
