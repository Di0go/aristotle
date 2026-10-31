// What the differentials of the migration to @organon/core (scripts/proofs/*-differential.ts) share: the reference
// Aristotle (main, by default) in a throwaway git worktree, a private temp folder, copies of a data folder, hashes in
// place of values (the data is the learner's history), and a way out that refuses everything. Galen's
// scripts/proofs/ are the model.
//
// Hermetic: every side runs with hermeticEnv(), so a call to the outside (a model provider, a web page) goes to a
// proxy here that refuses it and counts it, and the verdict is the same with or without a network.

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import type net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../..');

export const hash = (v: unknown) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex')
    .slice(0, 12);

/** `--name value` from the command line. */
export function option(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** The data folder to copy: --data, else .dev/data (pnpm dev:snapshot). Never the real data/. */
export function sourceData(): string {
  const source = path.resolve(option('--data') ?? path.join(ROOT, '.dev/data'));
  if (!existsSync(source)) throw new Error(`No ${source}: run pnpm dev:snapshot first.`);
  if (source === path.join(ROOT, 'data')) throw new Error('Never the real data/: copy it with pnpm dev:snapshot.');
  return source;
}

/** A private temp folder (700), removed by the returned function. */
export function workDir(name: string): { dir: string; done: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), `aristotle-${name}-`));
  chmodSync(dir, 0o700);
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Copies `source` (without its .git) to `dest`. */
export function copyData(source: string, dest: string) {
  cpSync(source, dest, { recursive: true, filter: (src) => path.basename(src) !== '.git' });
}

/** The reference checkout in `dir/ref` (a detached worktree); `install` gives it its own node_modules. */
export function reference(dir: string, install = false): { root: string; remove: () => void } {
  const root = path.join(dir, 'ref');
  execFileSync('git', ['worktree', 'add', '--quiet', '--detach', root, option('--ref') ?? 'main'], { cwd: ROOT });
  if (
    install &&
    spawnSync('pnpm', ['install', '--frozen-lockfile', '--prefer-offline', '--silent'], { cwd: root, stdio: 'ignore' }).status !== 0
  )
    throw new Error('pnpm install failed in the reference worktree');
  return { root, remove: () => void spawnSync('git', ['worktree', 'remove', '--force', root], { cwd: ROOT }) };
}

/** Every file under `dir`, by relative path, hashed (names of files set aside keep only their prefix). */
export function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else out[path.relative(dir, f).replace(/\.unreadable-.*$/, '.unreadable-<time>')] = hash(readFileSync(f));
    }
  };
  walk(dir);
  return out;
}

/** Prints each line of `a` beside `b`'s, and whether they agree; true when all do. */
export function compare(a: string[], b: string[], allowed: Record<string, string> = {}): boolean {
  let same = a.length === b.length;
  for (const [i, line] of a.entries()) {
    const key = line.split(' ')[0] ?? '';
    const ok = line === b[i];
    const why = allowed[key];
    if (!ok && !why) same = false;
    console.log(`${line.padEnd(40)} ${ok ? 'same' : why ? `allowed: ${why} (new: ${b[i]})` : `DIFFERENT (new: ${b[i]})`}`);
  }
  if (b.length > a.length) for (const line of b.slice(a.length)) console.log(`${''.padEnd(40)} DIFFERENT (only new: ${line})`);
  return same;
}

/**
 * A proxy that refuses whatever a side asks of the outside, and counts it by side and host. NODE_USE_ENV_PROXY routes
 * Node's fetch and https through it; the side rides in the proxy's user name (http://a@…).
 */
export async function refusingProxy(): Promise<{ url: (side: string) => string; calls: Map<string, number>; close: () => void }> {
  const calls = new Map<string, number>();
  const count = (auth: string | undefined, host: string) => {
    const side =
      Buffer.from((auth ?? '').replace(/^Basic /, ''), 'base64')
        .toString()
        .split(':')[0] || '?';
    const key = `${side} ${host}`;
    calls.set(key, (calls.get(key) ?? 0) + 1);
  };
  const server = http.createServer((req, res) => {
    count(req.headers['proxy-authorization'], new URL(req.url ?? '', 'http://x').host);
    res.writeHead(502).end();
  });
  server.on('connect', (req, socket: net.Socket) => {
    count(req.headers['proxy-authorization'], req.url ?? '');
    socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
  });
  const port = await new Promise<number>((r) => server.listen(0, '127.0.0.1', () => r((server.address() as net.AddressInfo).port)));
  return { url: (side) => `http://${side}@127.0.0.1:${port}`, calls, close: () => server.close() };
}

/** The calls the proxy refused, said in one line (the same on both sides is fine; only on one is a difference). */
export function refused(calls: Map<string, number>): { line: string; lopsided: boolean } {
  const by = (side: string) =>
    [...calls]
      .filter(([k]) => k.startsWith(`${side} `))
      .map(([k, n]) => `${k.slice(side.length + 1)} ${n}`)
      .sort()
      .join(', ');
  const [a, b] = [by('a'), by('b')];
  return { line: `calls out, refused: ref [${a || 'none'}], new [${b || 'none'}]`, lopsided: a !== b };
}

/**
 * The environment of one side: the shell's without any ARISTOTLE_* or proxy variable, everything out through the
 * refusing proxy, the clock in Lisbon, and `own` on top.
 */
export function hermeticEnv(proxy: string, own: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ARISTOTLE_') && !/_proxy$/i.test(k))),
    NODE_USE_ENV_PROXY: '1',
    HTTPS_PROXY: proxy,
    HTTP_PROXY: proxy,
    NO_PROXY: 'localhost,127.0.0.1,::1',
    TZ: 'Europe/Lisbon',
    ...own,
  };
}
