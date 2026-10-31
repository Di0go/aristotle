// The differential test of the migration to @organon/core (Organon's docs/plano.md, step 3): Aristotle's server as
// it is on a reference (main, by default) and as it is in this checkout, side by side, each on its own copy of the
// same data, sent the same requests in the same order. Every answer (status, type, body), the live feed's events, the
// drawer's handshake, the MCP tools and their answers (a whole sitting: start, show, quiz, an answer, ask, the map,
// practice, the end), and in the end every file of both data folders and both settings.json, must be the same.
// Prints hashes and route names, never values: the data is the learner's history.
//
//   node scripts/proofs/differential.ts                     .dev/data (pnpm dev:snapshot: a copy of the real data)
//   node scripts/proofs/differential.ts --data <folder>     another copy (the demo library, for data not used to build)
//   node scripts/proofs/differential.ts --ref <ref>         against another commit than main
//
// What may differ, and why, is listed in ALLOWED below, each with its reason, written before the run that needs it:
// anything else is a failure. Both servers run as live instances (TLS on a throwaway certificate, no backup), on free
// ports, in a private temp folder deleted at the end; the reference runs from a throwaway git worktree. Hermetic: both
// reach the outside only through a proxy that refuses every call, and a call made by one side only is a difference.
// Nothing of the checkout's data/ is read.

import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { get as httpGet } from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import WebSocket from 'ws';
import { hermeticEnv, refused, refusingProxy } from './reference.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const ref = opt('--ref') ?? 'main';
const source = path.resolve(opt('--data') ?? path.join(ROOT, '.dev/data'));
if (!existsSync(source)) throw new Error(`No ${source}: run pnpm dev:snapshot first.`);
if (source === path.join(ROOT, 'data')) throw new Error('Never the real data/: copy it with pnpm dev:snapshot.');

/**
 * Differences that are expected, by step name, each with its reason. A step listed here is reported as "allowed",
 * not "same": the list is what the migration changed on purpose, and docs/plano.md says it.
 */
const ALLOWED: Record<string, string> = {
  // (none yet: each one is added with its reason before the commit that needs it)
};

/**
 * Of the allowed steps, those where only what the body says may differ: the status, the security headers, the
 * content type and any redirect must still be the same (a raw-Host step's status too).
 */
const BODY_ONLY = new Set<string>();

/** A step's result without its body: what must still match on a BODY_ONLY step. */
function withoutBody(r: unknown): unknown {
  if (typeof r === 'string') return r.split(' ')[0];
  if (r && typeof r === 'object' && 'body' in r) return { ...(r as Record<string, unknown>), body: undefined };
  return r;
}

const hash = (v: unknown) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex')
    .slice(0, 12);

/** Today, in Lisbon, as the server names a sitting. */
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
const proxy = await refusingProxy();
const work = mkdtempSync(path.join(tmpdir(), 'aristotle-differential-'));
chmodSync(work, 0o700);
const children: ChildProcess[] = [];
let worktree: string | undefined;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

interface Side {
  name: 'ref' | 'new';
  root: string;
  dataDir: string;
  stateDir: string;
  port: number;
  base: string;
  child?: ChildProcess;
  mcp?: Client;
}

async function prepare(name: Side['name'], root: string): Promise<Side> {
  const dir = path.join(work, name);
  const dataDir = path.join(dir, 'data');
  const stateDir = path.join(dir, 'state');
  cpSync(source, dataDir, { recursive: true, filter: (src) => path.basename(src) !== '.git' });
  mkdirSync(path.join(stateDir, 'tls'), { recursive: true });
  // The same certificate for both, from the checkout's own script, marked trusted as setup-hostname.sh does.
  if (name === 'ref') {
    const tls = path.join(work, 'tls');
    const script = existsSync(path.join(ROOT, 'scripts/tls.sh')) ? ['scripts/tls.sh'] : ['node_modules/@organon/core/scripts/tls.sh', '.'];
    const made = spawnSync('bash', script, { cwd: ROOT, env: { ...process.env, ARISTOTLE_TLS_DIR: tls }, stdio: 'ignore' });
    if (made.status !== 0) throw new Error('tls.sh failed');
  }
  cpSync(path.join(work, 'tls'), path.join(stateDir, 'tls'), { recursive: true });
  cpSync(path.join(work, 'tls'), path.join(stateDir, 'tls'), { recursive: true });
  const port = await freePort();
  return { name, root, dataDir, stateDir, port, base: `http://localhost:${port}` };
}

async function start(side: Side) {
  const tlsPort = await freePort();
  const env = hermeticEnv(proxy.url(side.name === 'ref' ? 'a' : 'b'), {
    ARISTOTLE_PORT: String(side.port),
    ARISTOTLE_TLS_PORT: String(tlsPort),
    ARISTOTLE_DATA_DIR: side.dataDir,
    ARISTOTLE_STATE_DIR: side.stateDir,
    ARISTOTLE_TLS_DIR: path.join(side.stateDir, 'tls'),
    ARISTOTLE_BACKUP: 'off',
    ARISTOTLE_TERMINAL_QUIET_MS: '300',
    ARISTOTLE_CLAUDE_CWD: path.join(side.stateDir, 'claude'),
    ARISTOTLE_CLAUDE_CMD: 'bash --norc --noprofile',
    ARISTOTLE_ONESHOT_CMD: 'cat',
    ARISTOTLE_API_KEY: '',
    // quiz and ask hand back "No answer yet" after half a second, so a whole sitting runs in seconds.
    ARISTOTLE_WAIT_MS: '500',
    ARISTOTLE_WAIT_SLICE_MS: '250',
    PS1: '$ ',
  });
  const log = path.join(work, `${side.name}.log`);
  side.child = spawn(
    'bash',
    [
      '-c',
      `exec node --import ${JSON.stringify(path.join(import.meta.dirname, 'seeded-random.ts'))} server/index.ts >${JSON.stringify(log)} 2>&1`,
    ],
    { cwd: side.root, env },
  );
  children.push(side.child);
  for (let i = 0; i < 100; i++) {
    try {
      const h = (await (await fetch(`${side.base}/api/health`)).json()) as { ok?: boolean };
      if (h.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
    if (i === 99) throw new Error(`${side.name} did not start:\n${readFileSync(log, 'utf8').slice(-2000)}`);
  }
  side.mcp = new Client({ name: 'differential', version: '0' });
  await side.mcp.connect(new StreamableHTTPClientTransport(new URL(`${side.base}/mcp`)));
}

/** A body made comparable: this side's folders and port named, times of writing and pids blanked. */
function normalise(side: Side, text: string): string {
  return (
    text
      .replaceAll(side.dataDir, '<data>')
      .replaceAll(side.stateDir, '<state>')
      .replaceAll(side.root, '<root>')
      .replaceAll(String(side.port), '<port>')
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<id>')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?/g, '<time>')
      // A sitting started now is named by the moment it started, to the millisecond: one per side.
      .replaceAll(`${today}-`, '<today>-')
      .replace(/<today>-\d{9}/g, '<today>-<ms>')
      .replace(/"pid":\d+/g, '"pid":0')
      // Which build the interface is (its file names) changes with any change to it: what the build says is compared.
      .replace(/assets\/[\w.-]+/g, 'assets/<file>')
      .replace(/"build":"[\w-]+"/g, '"build":"<build>"')
  );
}

interface Req {
  method?: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  raw?: string;
}

async function request(side: Side, r: Req) {
  const headers: Record<string, string> = { ...(r.headers ?? {}) };
  if (r.body !== undefined || r.raw !== undefined) headers['Content-Type'] ??= 'application/json';
  const send = () =>
    fetch(`${side.base}${r.path}`, {
      method: r.method ?? 'GET',
      headers,
      body: r.raw ?? (r.body === undefined ? undefined : JSON.stringify(r.body)),
      redirect: 'manual',
    });
  // A server that refused an oversized body closes that connection, and fetch may reuse it for the next request: one
  // retry on a new connection. A server that is down fails twice.
  const res = await send().catch(async () => {
    await new Promise((r) => setTimeout(r, 200));
    return send();
  });
  const type = (res.headers.get('content-type') ?? '').replace(/;\s*charset=utf-8/i, '');
  const body = normalise(side, await res.text());
  if (args.includes('--show')) shown.set(`${side.name} ${r.method ?? 'GET'} ${r.path}`, body);
  const security = ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'cross-origin-opener-policy']
    .map((h) => `${h}=${res.headers.get(h)}`)
    .join(' ');
  return { status: res.status, type, body: hash(body), security: hash(normalise(side, security)), location: res.headers.get('location') };
}

/** A request with a Host of its own choosing, as a rebound DNS name would send (fetch never lets one be set). */
function rawHost(side: Side, host: string): Promise<string> {
  return new Promise((resolve) => {
    httpGet({ host: '127.0.0.1', port: side.port, path: '/api/health', headers: { Host: host } }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve(`${res.statusCode} ${hash(normalise(side, body))}`));
    }).on('error', (e) => resolve(`error ${e.message}`));
  });
}

/** The first events the live feed sends while `act` runs, normalised. */
async function feed(side: Side, act: () => Promise<unknown>) {
  const ac = new AbortController();
  const res = await fetch(`${side.base}/api/events`, { signal: ac.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const reading = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
      }
    } catch {}
  })();
  await new Promise((r) => setTimeout(r, 200));
  await act();
  await new Promise((r) => setTimeout(r, 800));
  ac.abort();
  await reading;
  const events = text
    .split('\n\n')
    .filter((e) => e.startsWith('data: '))
    .map((e) => normalise(side, e));
  return { head: text.split('\n')[0], events: events.length, body: hash(events) };
}

/** The drawer's WebSocket: who is let in, and what a shell in the agent's place says first. */
function terminal(side: Side, origin?: string): Promise<string> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${side.port}/api/terminal`, origin ? { origin } : {});
    const types: string[] = [];
    ws.on('unexpected-response', (_req, res) => resolve(`refused ${res.statusCode}`));
    ws.on('message', (raw) => types.push((JSON.parse(String(raw)) as { type: string }).type));
    ws.on('open', () =>
      setTimeout(() => {
        ws.close();
        resolve(`open, first ${[...new Set(types)].sort().join(',')}`);
      }, 1500),
    );
    ws.on('error', () => {});
  });
}

/** Every file under `dir`, by path, hashed. */
function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else
        out[normalise({ dataDir: dir } as Side, path.relative(dir, f))] = hash(
          normalise({ dataDir: dir } as Side, readFileSync(f, 'utf8')),
        );
    }
  };
  walk(dir);
  return out;
}

/** With --show, the normalised bodies of steps that differ are printed: for debugging on demo data, never his. */
const shown = new Map<string, string>();

type Step = { name: string; run: (side: Side) => Promise<unknown> };

const textOf = (r: unknown) => ((r as { content?: { text?: string }[] }).content ?? []).map((c) => c.text ?? '').join('\n');
const tool =
  (name: string, args: Record<string, unknown> = {}) =>
  async (side: Side) => {
    const r = await side.mcp!.callTool({ name, arguments: args });
    return { error: Boolean((r as { isError?: boolean }).isError), text: hash(normalise(side, textOf(r))) };
  };

/** The newest item of `type` in the open sitting, from /api/state: what an answer is sent to. */
async function lastItem(side: Side, type: string): Promise<string | undefined> {
  const state = (await (await fetch(`${side.base}/api/state`)).json()) as { session?: { items?: { id: string; type: string }[] } };
  return state.session?.items?.filter((i) => i.type === type).at(-1)?.id;
}

/** The steps, built from what the reference answers: a topic to open, a roadmap, a past sitting. */
async function steps(ref: Side): Promise<Step[]> {
  const topics = (await (await fetch(`${ref.base}/api/topics`)).json()) as { slug: string }[];
  const roadmaps = (await (await fetch(`${ref.base}/api/roadmaps`)).json()) as { slug?: string; id?: string }[];
  const sessions = (await (await fetch(`${ref.base}/api/sessions`)).json()) as { id: string }[];
  const topic = topics[0]?.slug ?? 'nope';
  const http = (name: string, r: Req): Step => ({ name, run: (s) => request(s, r) });
  const NEW = 'differential-topic';
  return [
    { name: 'health', run: async (s) => request(s, { path: '/api/health' }) },
    http('state', { path: '/api/state' }),
    http('topics', { path: '/api/topics' }),
    ...topics.slice(0, 3).map((t, i) => http(`topic ${i}`, { path: `/api/topics/${encodeURIComponent(t.slug)}` })),
    http('topic missing', { path: '/api/topics/nope-nope' }),
    http('map', { path: '/api/map' }),
    http('roadmaps', { path: '/api/roadmaps' }),
    ...roadmaps.slice(0, 2).map((r, i) => http(`roadmap ${i}`, { path: `/api/roadmaps/${encodeURIComponent(r.slug ?? r.id ?? '')}` })),
    http('missions', { path: '/api/missions' }),
    http('glosses', { path: '/api/glosses' }),
    http('asides', { path: '/api/asides' }),
    http('notes', { path: '/api/notes' }),
    http('about', { path: '/api/about' }),
    http('chat topic', { path: `/api/chats/${encodeURIComponent(topic)}` }),
    http('settings', { path: '/api/settings' }),
    http('sessions', { path: '/api/sessions' }),
    http('sessions of topic', { path: `/api/sessions?topic=${encodeURIComponent(topic)}` }),
    ...sessions.slice(0, 2).map((x, i) => http(`session ${i}`, { path: `/api/sessions/${encodeURIComponent(x.id)}` })),
    http('session missing', { path: '/api/sessions/nope' }),
    http('progress', { path: '/api/progress' }),
    http('reviews', { path: '/api/reviews' }),
    http('search empty', { path: '/api/search?q=' }),
    http('search a', { path: '/api/search?q=stress' }),
    http('search b', { path: '/api/search?q=matriz' }),
    http('backup', { path: '/api/backup' }),
    http('not found', { path: '/api/nope' }),
    http('index', { path: '/' }),
    http('route', { path: '/map' }),
    http('asset missing', { path: '/assets/index-nope.js' }),
    http('traversal', { path: '/..%2f..%2fetc/passwd' }),
    http('bad escape', { path: '/%E0%A4%A' }),
    { name: 'host other', run: (s) => rawHost(s, 'evil.test') },
    { name: 'host own name', run: (s) => rawHost(s, 'aristotle.test') },
    http('origin other', { path: '/api/health', headers: { Origin: 'http://evil.test' } }),
    http('cross site', { path: '/api/health', headers: { 'Sec-Fetch-Site': 'cross-site' } }),
    http('mcp get', { path: '/mcp' }),
    http('presence', { method: 'POST', path: '/api/presence', body: {} }),
    http('text body', { method: 'POST', path: '/api/glosses', raw: '{}', headers: { 'Content-Type': 'text/plain' } }),
    http('gloss not json', { method: 'POST', path: '/api/glosses', raw: '{"text": 3,' }),
    http('gloss too big', { method: 'POST', path: '/api/glosses', raw: JSON.stringify({ text: 'x'.repeat(1_100_000) }) }),
    http('gloss empty', { method: 'POST', path: '/api/glosses', body: {} }),
    http('answer no id', { method: 'POST', path: '/api/answer', body: {} }),
    http('answer unknown', { method: 'POST', path: '/api/answer', body: { id: 'nope', text: 'x' } }),
    http('chat not json', { method: 'POST', path: `/api/chats/${encodeURIComponent(topic)}`, raw: 'not json' }),
    http('chat empty body', { method: 'POST', path: `/api/chats/${encodeURIComponent(topic)}`, raw: '' }),
    http('about write', { method: 'PUT', path: '/api/about', body: { text: 'Written by the differential.\n' } }),
    http('about after', { path: '/api/about' }),
    http('settings bad', { method: 'PUT', path: '/api/settings', body: { tutor: 'nope' } }),
    http('settings change', {
      method: 'PUT',
      path: '/api/settings',
      body: { tutor: 'codex', helpers: 'api', api: { provider: 'ollama', model: 'qwen3:8b' } },
    }),
    http('settings key', {
      method: 'PUT',
      path: '/api/settings',
      body: { api: { apiKey: 'sk-test-0123456789', baseUrl: 'http://localhost:11434/v1/' } },
    }),
    http('settings models', { path: '/api/settings/models' }),
    http('settings back', { method: 'PUT', path: '/api/settings', body: { tutor: 'claude', helpers: 'oneshot' } }),
    { name: 'terminal own page', run: (s) => terminal(s, `http://localhost:${s.port}`) },
    { name: 'terminal no origin', run: (s) => terminal(s) },
    { name: 'terminal other page', run: (s) => terminal(s, 'http://evil.test') },
    {
      name: 'mcp tools',
      run: async (s) => {
        const { tools } = await s.mcp!.listTools();
        return { count: tools.length, names: hash(tools.map((t) => t.name)), all: hash(tools) };
      },
    },
    {
      name: 'mcp prompts',
      run: async (s) => {
        const r = await s.mcp!.listPrompts().catch((e: Error) => ({ error: e.message }));
        return hash(normalise(s, JSON.stringify(r)));
      },
    },
    { name: 'mcp instructions', run: async (s) => hash(normalise(s, s.mcp!.getInstructions() ?? '')) },
    { name: 'list_topics', run: tool('list_topics') },
    { name: 'get_topic', run: tool('get_topic', { topic }) },
    { name: 'read_about', run: tool('read_about') },
    { name: 'profile', run: tool('profile') },
    { name: 'list_roadmaps', run: tool('list_roadmaps') },
    { name: 'list_missions', run: tool('list_missions') },
    { name: 'due_reviews', run: tool('due_reviews') },
    { name: 'method', run: tool('method', { name: 'teach' }) },
    { name: 'method list', run: tool('method') },
    { name: 'get_topic bad', run: tool('get_topic', { topic: 'nope-nope' }) },
    // A whole sitting on a new topic, with the feed open: the events it sends, then what it wrote.
    {
      name: 'start_session + feed',
      run: (s) => feed(s, () => tool('start_session', { kind: 'learn', topic: 'Differential topic', goal: 'Check the migration.' })(s)),
    },
    {
      name: 'update_map',
      run: tool('update_map', {
        concepts: [
          { id: 'one', label: 'One', summary: 'The first', status: 'unknown', goal: true },
          { id: 'two', label: 'Two', summary: 'The second', status: 'shaky', deps: ['one'], note: 'watch it' },
        ],
        focus: 'one',
      }),
    },
    {
      name: 'show',
      run: tool('show', { markdown: '# A step\n\nWith $x^2$ and a table:\n\n| a | b |\n|---|---|\n| `x\\|y` | 2 |', concept: 'one' }),
    },
    {
      name: 'quiz (no answer yet)',
      run: tool('quiz', {
        questions: [{ question: 'Which?', options: ['this', 'that'], correct: 0, explanation: 'Because.', concept: 'one' }],
      }),
    },
    {
      name: 'answer the quiz',
      run: async (s) =>
        request(s, { method: 'POST', path: '/api/answer', body: { id: (await lastItem(s, 'quiz')) ?? 'none', picks: [0] } }),
    },
    { name: 'collect_answers', run: tool('collect_answers') },
    { name: 'ask (no answer yet)', run: tool('ask', { prompt: 'Why?', concept: 'two' }) },
    {
      name: 'answer the ask + feed',
      run: (s) =>
        feed(s, async () =>
          request(s, { method: 'POST', path: '/api/answer', body: { id: (await lastItem(s, 'ask')) ?? 'none', text: 'Because of one.' } }),
        ),
    },
    { name: 'collect_answers again', run: tool('collect_answers') },
    { name: 'record_practice', run: tool('record_practice', { results: [{ concept: 'one', outcome: 'right', kind: 'recall' }] }) },
    { name: 'get_topic new', run: tool('get_topic', { topic: NEW }) },
    { name: 'state in sitting', run: (s) => request(s, { path: '/api/state' }) },
    { name: 'end_session', run: tool('end_session', { locked: 'One.', shaky: 'Two.', next: 'Two, because it rests on one.' }) },
    { name: 'state after', run: (s) => request(s, { path: '/api/state' }) },
    { name: 'topic after', run: (s) => request(s, { path: `/api/topics/${NEW}` }) },
    { name: 'progress after', run: (s) => request(s, { path: '/api/progress' }) },
    { name: 'leave', run: (s) => request(s, { method: 'POST', path: '/api/leave', body: {} }) },
    http('chat clear', { method: 'DELETE', path: `/api/chats/${encodeURIComponent(topic)}` }),
  ];
}

let code = 1;
try {
  worktree = path.join(work, 'checkout');
  execFileSync('git', ['worktree', 'add', '--quiet', '--detach', worktree, ref], { cwd: ROOT });
  // The reference's dependencies: its own lockfile, installed offline from the store pnpm already has.
  const installed = spawnSync('pnpm', ['install', '--frozen-lockfile', '--prefer-offline', '--silent'], {
    cwd: worktree,
    stdio: 'inherit',
  });
  if (installed.status !== 0) throw new Error(`pnpm install failed in the ${ref} worktree`);
  const build = (cwd: string) => spawnSync('pnpm', ['build', '--logLevel', 'error'], { cwd, stdio: 'inherit' }).status === 0;
  if (!args.includes('--no-build') && !(build(worktree) && build(ROOT))) throw new Error('A build failed');
  const a = await prepare('ref', worktree);
  const b = await prepare('new', ROOT);
  await Promise.all([start(a), start(b)]);
  const list = await steps(a);
  let same = 0;
  let allowed = 0;
  let different = 0;
  for (const step of list) {
    const [ra, rb] = [
      await step.run(a).catch((e: Error) => `threw ${e.message}`),
      await step.run(b).catch((e: Error) => `threw ${e.message}`),
    ];
    const ok = JSON.stringify(ra) === JSON.stringify(rb);
    const bodyOnly = !BODY_ONLY.has(step.name) || JSON.stringify(withoutBody(ra)) === JSON.stringify(withoutBody(rb));
    const why = bodyOnly ? ALLOWED[step.name] : undefined;
    if (ok) same++;
    else if (why) allowed++;
    else different++;
    const mark = ok ? 'same' : why ? `allowed (${why})` : 'DIFFERENT';
    if (!ok && args.includes('--show'))
      for (const [k, v] of shown)
        if (k.startsWith('ref ') && shown.get(`new ${k.slice(4)}`) !== v)
          console.log(`  ${k}\n    ${v.slice(0, 1500)}\n  new\n    ${shown.get(`new ${k.slice(4)}`)?.slice(0, 1500)}`);
    shown.clear();
    console.log(`${step.name.padEnd(26)} ${mark}${ok ? '' : `\n    ref: ${JSON.stringify(ra)}\n    new: ${JSON.stringify(rb)}`}`);
  }
  await Promise.all([a.mcp?.close(), b.mcp?.close()]);
  for (const s of [a, b]) s.child?.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 1500));
  // Every file both left in their data and state folders.
  const files = (s: Side) => ({
    ...tree(s.dataDir),
    ...Object.fromEntries(
      Object.entries(tree(s.stateDir))
        .filter(([f]) => f === 'settings.json')
        .map(([f, h]) => [`<state>/${f}`, h]),
    ),
  });
  const fa = files(a);
  const fb = files(b);
  const names = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].sort();
  const changed = names.filter((n) => fa[n] !== fb[n]);
  for (const n of changed) console.log(`file ${n.padEnd(40)} DIFFERENT (ref ${fa[n] ?? 'missing'}, new ${fb[n] ?? 'missing'})`);
  console.log(`files: ${names.length} compared, ${changed.length} different`);
  const settingsMode = (s: Side) =>
    existsSync(path.join(s.stateDir, 'settings.json'))
      ? (statSync(path.join(s.stateDir, 'settings.json')).mode & 0o777).toString(8)
      : 'none';
  const modes = `${settingsMode(a)} ${settingsMode(b)}`;
  console.log(`settings.json mode: ref ${settingsMode(a)}, new ${settingsMode(b)}`);
  console.log(`\nsteps: ${list.length}; same ${same}, allowed ${allowed}, different ${different}`);
  const out = refused(proxy.calls);
  console.log(out.line);
  code = different === 0 && changed.length === 0 && !out.lopsided && modes.split(' ')[0] === modes.split(' ')[1] ? 0 : 1;
  console.log(code ? 'DIFFERENT' : 'SAME');
} finally {
  for (const c of children) c.kill('SIGKILL');
  if (worktree) spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: ROOT });
  proxy.close();
  rmSync(work, { recursive: true, force: true });
}
process.exit(code);
