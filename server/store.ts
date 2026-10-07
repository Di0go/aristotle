// How the stores read and write their files in data/. Writes: each file written whole (temp file + rename, so a crash
// never leaves half a file), one write at a time per file, on a queue that carries on after a failed write; the next
// write of that file carries the latest state, so memory and disk meet again. Reads: a file that can't be read or
// isn't the right shape is set aside (renamed, never deleted) and reported as a warning (warnings.ts), so one bad file
// never stops the server and is never overwritten.

import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.ts';
import { warnings } from './warnings.ts';

/** Writes one after another per key; a failure is the caller's to see, never the next write's. */
export class WriteQueue {
  private tails = new Map<string, Promise<void>>();

  /** Runs `job` once the previous job for `key` has finished, whether or not that one worked. */
  run(key: string, job: () => Promise<void>): Promise<void> {
    const next = (this.tails.get(key) ?? Promise.resolve()).then(job);
    const tail = next.catch(() => {});
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return next;
  }

  /** Resolves once every job queued so far has finished. */
  async idle(): Promise<void> {
    await Promise.all(this.tails.values());
  }
}

/** Writes `body` to `file` atomically: a temp file next to it, then a rename over it. */
export async function writeFileAtomic(file: string, body: string) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, body);
  await rename(tmp, file);
}

/** `value` as pretty JSON, written atomically. */
export function writeJson(file: string, value: unknown): Promise<void> {
  return writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Every `.json` file in `dir` that parses and passes `valid`, oldest name first; the others are set aside. */
export async function loadJsonDir<T>(dir: string, valid: (v: unknown) => v is T): Promise<T[]> {
  await mkdir(dir, { recursive: true });
  const names = (await readdir(dir)).sort();
  reportSetAside(dir, names);
  const files = names.filter((f) => f.endsWith('.json'));
  const loaded: (T | undefined)[] = await Promise.all(files.map((f) => loadOne(path.join(dir, f), valid)));
  return loaded.filter((v): v is T => v !== undefined);
}

/** One JSON file: its value, `fallback` when it doesn't exist, or `fallback` when it is set aside as unreadable. */
export async function loadJson<T>(file: string, valid: (v: unknown) => v is T, fallback: T): Promise<T> {
  reportSetAside(path.dirname(file), await readdir(path.dirname(file)).catch(() => []), path.basename(file));
  return (await loadOne(file, valid)) ?? fallback;
}

/** A file's value; undefined when it is missing, or unreadable (then it is renamed aside and reported). */
async function loadOne<T>(file: string, valid: (v: unknown) => v is T): Promise<T | undefined> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    // Can't even be read (permissions, a disk error): left where it is, and said.
    warnings.set(`file:${file}`, `A data file could not be read: ${path.relative(DATA_DIR, file)} (${(err as Error).message}).`);
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(text);
    if (valid(value)) return value;
  } catch {}
  const aside = `${file}.unreadable-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await rename(file, aside);
  console.error(`${new Date().toISOString()} Set aside unreadable ${file} as ${path.basename(aside)}`);
  warnings.set(`file:${aside}`, unreadable(aside));
  return undefined;
}

/** Warns about files set aside on an earlier run, until someone fixes or removes them. */
function reportSetAside(dir: string, names: string[], only?: string) {
  for (const name of names) {
    if (!name.includes('.unreadable-') || (only && !name.startsWith(`${only}.unreadable-`))) continue;
    const file = path.join(dir, name);
    warnings.set(`file:${file}`, unreadable(file));
  }
}

function unreadable(file: string): string {
  return `A data file could not be read and was set aside: ${path.relative(DATA_DIR, file)}. Fix it (and rename it back) or delete it.`;
}

/** A plain object (for the shape checks the stores pass to the loaders). */
export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
