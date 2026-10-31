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
// What may differ, and why, is listed in CUTS (a field added, cut from both sides and required on the new one) and
// EXACT (an answer that is now the core's, given exactly) below, each with its reason, written before the run that
// needs it: anything else is a failure. Times written during the run are blanked; a review card's due date is compared
// as its interval from the review that set it. Both servers run as live instances (TLS on a throwaway certificate, no
// backup), on free ports, in a private temp folder deleted at the end; the reference runs from a throwaway git worktree. Hermetic: both
// reach the outside only through a proxy that refuses every call, and a call made by one side only is a difference.
// Nothing of the checkout's data/ is read.

import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { get as httpGet, request as httpRequest } from 'node:http';
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
// (Nothing is allowed by step any more: what changed on purpose is cut field by field, in CUTS, or given exactly, in
// EXACT, below. 13/n: the method tool's description ends in the core's words, 'Without `name`, lists the routines.'
// where main said 'lists them': the 'mcp tools' step sets aside that sentence alone.)

/** This checkout's commit: what the core's /api/health must say it runs. */
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();

/**
 * Allowed differences scoped to what the migration added, never the whole answer: the fields (JSON keys, or patterns
 * in a page) are cut from both sides' bodies before the rest is compared, and the new side must have every one of
 * them, with the value given where there is one. Each with its reason, written before the run that needs it.
 */
interface Cut {
  why: string;
  keys?: Record<string, (v: unknown) => boolean>;
  patterns?: RegExp[];
}
// normalise() has already written a build's name ([\w-]+, the interface's own) as <build>: anything else stays.
const isBuild = (v: unknown) => v === '<build>';
// 26/n: the server is the core's serve().
const HEALTH: Cut = {
  why: 'the core says which app and which commit it is too, so a release can tell a new server from the old',
  keys: { app: (v) => v === 'aristotle', commit: (v) => v === HEAD },
};
const STATE: Cut = {
  why: "/api/state carries the interface's build too, so a page loads a new release on its own",
  keys: { build: isBuild },
};
// 11/n: the page the server hands for any route of the interface.
const PAGE: Cut = {
  why: "index.html tells the core's theme-boot.js Aristotle's key, default accent and old key",
  patterns: [/ data-key="aristotle\.look"/, / data-accent="blue"/, / data-legacy="mind-gym\.look"/],
};
const CUTS: Record<string, Cut> = {
  health: HEALTH,
  'host own name': HEALTH,
  state: STATE,
  'state in sitting': STATE,
  'state after': STATE,
  index: PAGE,
  route: PAGE,
  traversal: PAGE,
};

/**
 * Answers that changed on purpose to the core's, by step: the new side must give exactly this (status and body, a
 * body with no learner data in it), and the reference whatever it gave before, with the same status class.
 */
const EXACT: Record<string, { why: string; status: number; body: string }> = {
  // 26/n: the core reads every JSON body (readJson), with its own two errors.
  'gloss not json': { why: 'a body that is not JSON is the core\'s 400, "Not JSON"', status: 400, body: '{"error":"Not JSON"}' },
  'gloss too big': {
    why: 'a body over 1 MB is the core\'s 413, "Body too large", not a 400',
    status: 413,
    body: '{"error":"Body too large"}',
  },
  'chat not json': { why: 'a body that is not JSON is the core\'s 400, "Not JSON"', status: 400, body: '{"error":"Not JSON"}' },
};

/** Cuts a step's fields out of a body, both sides alike; which of them were there. */
function cutFields(text: string, cut: Cut | undefined): { text: string; found: string[] } {
  if (!cut) return { text, found: [] };
  const found: string[] = [];
  if (cut.keys) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      for (const [k, ok] of Object.entries(cut.keys))
        if (k in obj) {
          found.push(ok(obj[k]) ? k : `${k}=wrong`);
          delete obj[k];
        }
      text = JSON.stringify(obj);
    } catch {}
  }
  for (const p of cut.patterns ?? []) {
    if (p.test(text)) found.push(p.source);
    text = text.replace(p, '');
  }
  return { text, found };
}
const expected = (cut: Cut) => [...Object.keys(cut.keys ?? {}), ...(cut.patterns ?? []).map((p) => p.source)];

const hash = (v: unknown) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex')
    .slice(0, 12);

/** When this run started: a time before it comes from the copied data, the same on both sides, and is compared. */
const RUN_START = Date.now();

/**
 * Times in a body: one written during the run (when something was saved) is blanked, one from the copied data is
 * kept as it is. A review card's due date is compared as what FSRS decided, its distance from the review that set it
 * (to the millisecond: both are the same instant on one side), so a different schedule is a difference.
 */
function times(text: string): string {
  const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/;
  const card = new RegExp(`("due"\\s*:\\s*")(${ISO.source})("[^{}]*?"last"\\s*:\\s*")(${ISO.source})"`, 'g');
  // Stability and difficulty depend on the time since the last review, and the two sides are asked a few milliseconds
  // apart (an A/A run differed there, in the 12th digit): compared to 9 significant digits, which any change of rule
  // shows and a few milliseconds over days does not.
  const digits = /("(?:stability|difficulty)"\s*:\s*)(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/g;
  return text
    .replace(digits, (_m, k, n: string) => `${k}${Number(n).toPrecision(9)}`)
    .replace(card, (_m, a, due: string, b, last: string) => `${a}<last+${Date.parse(due) - Date.parse(last)}ms>${b}${last}"`)
    .replace(new RegExp(ISO.source, 'g'), (t) => (Date.parse(t) < RUN_START ? t : '<time>'));
}

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
      .replace(/[\s\S]*/, (t) => times(t))
      // A sitting started now is named by the moment it started, to the millisecond: one per side.
      .replaceAll(`${today}-`, '<today>-')
      .replace(/<today>-\d{9}/g, '<today>-<ms>')
      .replace(/"pid":\d+/g, '"pid":0')
      // Which build the interface is (its file names) changes with any change to it: what the build says is compared.
      // Which chunks the page preloads is how Vite splits the code (main's build has one more vendor chunk), not what
      // the page does: the UI differential compares what it does. The stylesheets and the entry stay compared.
      .replace(/\s*<link rel="modulepreload"[^>]*>/g, '')
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
  /** The step's name, for its cut fields (CUTS) or its exact answer (EXACT). */
  step?: string;
  /**
   * On a connection of its own, closed after: a server that refuses an oversized body may close the connection it
   * came on, and the next request must not depend on how each side does that.
   */
  alone?: boolean;
}

async function request(side: Side, r: Req) {
  const headers: Record<string, string> = { ...(r.headers ?? {}) };
  if (r.body !== undefined || r.raw !== undefined) headers['Content-Type'] ??= 'application/json';
  const payload = r.raw ?? (r.body === undefined ? undefined : JSON.stringify(r.body));
  const send = () =>
    r.alone
      ? alone(side, r.method ?? 'GET', r.path, headers, payload)
      : fetch(`${side.base}${r.path}`, { method: r.method ?? 'GET', headers, body: payload, redirect: 'manual' });
  // A server that refused an oversized body closes that connection, and fetch may reuse it for the next request: one
  // retry on a new connection. A server that is down fails twice.
  // Said in the result, so a retry on one side only is a difference, never hidden.
  let retried = false;
  const res = await send().catch(async () => {
    retried = true;
    await new Promise((r) => setTimeout(r, 200));
    return send();
  });
  const type = (res.headers.get('content-type') ?? '').replace(/;\s*charset=utf-8/i, '');
  const { text: body, found } = cutFields(normalise(side, await res.text()), CUTS[r.step ?? '']);
  if (args.includes('--show')) shown.set(`${side.name} ${r.method ?? 'GET'} ${r.path}`, body);
  const security = ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'cross-origin-opener-policy']
    .map((h) => `${h}=${res.headers.get(h)}`)
    .join(' ');
  const exact = r.step && EXACT[r.step] ? { plain: body } : {};
  return {
    status: res.status,
    type,
    body: hash(body),
    security: hash(normalise(side, security)),
    location: res.headers.get('location'),
    ...(retried ? { retried } : {}),
    ...(CUTS[r.step ?? ''] ? { found } : {}),
    ...exact,
  };
}

/** One request on a socket of its own (no keep-alive), answered as a Response, as fetch would. */
function alone(side: Side, method: string, route: string, headers: Record<string, string>, body?: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port: side.port, path: route, method, agent: false, headers: { ...headers, Host: `localhost:${side.port}` } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (d: Buffer) => chunks.push(d));
        res.on('end', () => {
          const h = new Headers();
          for (const [k, v] of Object.entries(res.headers)) if (typeof v === 'string') h.set(k, v);
          resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: h }));
        });
      },
    );
    // The server may answer before it has read the whole body, and close: the answer is what counts.
    req.on('error', reject);
    req.end(body);
  });
}

/** A request with a Host of its own choosing, as a rebound DNS name would send (fetch never lets one be set). */
function rawHost(side: Side, host: string, step?: string): Promise<string> {
  return new Promise((resolve) => {
    httpGet({ host: '127.0.0.1', port: side.port, path: '/api/health', headers: { Host: host } }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        const cut = cutFields(normalise(side, body), CUTS[step ?? '']);
        resolve(`${res.statusCode} ${hash(cut.text)}${CUTS[step ?? ''] ? ` found ${cut.found.join(',')}` : ''}`);
      });
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

/**
 * The tools a client is given, hashed. The one sentence the core words its own way (13/n) is set aside, and checked
 * to be main's words on the reference and the core's on the new side; nothing else of any tool may differ.
 */
async function toolsOf(s: Side, client: Client) {
  const { tools } = await client.listTools();
  const method = tools.find((t) => t.name === 'method');
  const ending = /Without `name`, lists (them|the routines)\.$/;
  const said = method?.description?.match(ending)?.[1];
  if (method?.description) method.description = method.description.replace(ending, '<lists>');
  const words = method ? said === (s.name === 'ref' ? 'them' : 'the routines') : 'no method';
  return { count: tools.length, names: hash(tools.map((t) => t.name)), all: hash(tools), words };
}

/**
 * An MCP client as a bridge started before the move to the core connects: X-Aristotle-Agent and X-Aristotle-Client,
 * as the checkout's .mcp.json of a live session still says. The core's server reads X-Organon-*: the app maps the old.
 */
async function oldBridge(s: Side, headers: Record<string, string>) {
  const client = new Client({ name: 'old-bridge', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${s.base}/mcp`), { requestInit: { headers } }));
  return client;
}

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
  // Solid concepts of the copied data that carry a review card: practised, each moves its card (FSRS), which the files
  // compared at the end then hold. Their ids only, never what they say.
  const solid: string[] = [];
  for (const f of readdirSync(path.join(ref.dataDir, 'topics')).filter((f) => f.endsWith('.json'))) {
    const t = JSON.parse(readFileSync(path.join(ref.dataDir, 'topics', f), 'utf8')) as {
      slug: string;
      concepts?: { id: string; status?: string; review?: unknown }[];
    };
    for (const c of t.concepts ?? []) if (c.status === 'solid' && c.review && solid.length < 3) solid.push(`${t.slug}/${c.id}`);
  }
  const http = (name: string, r: Req): Step => ({ name, run: (s) => request(s, { ...r, step: name }) });
  const NEW = 'differential-topic';
  return [
    http('health', { path: '/api/health' }),
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
    { name: 'host own name', run: (s) => rawHost(s, 'aristotle.test', 'host own name') },
    http('origin other', { path: '/api/health', headers: { Origin: 'http://evil.test' } }),
    http('cross site', { path: '/api/health', headers: { 'Sec-Fetch-Site': 'cross-site' } }),
    http('mcp get', { path: '/mcp' }),
    http('presence', { method: 'POST', path: '/api/presence', body: {} }),
    http('text body', { method: 'POST', path: '/api/glosses', raw: '{}', headers: { 'Content-Type': 'text/plain' } }),
    http('gloss not json', { method: 'POST', path: '/api/glosses', raw: '{"text": 3,' }),
    http('gloss too big', { method: 'POST', path: '/api/glosses', raw: JSON.stringify({ text: 'x'.repeat(1_100_000) }), alone: true }),
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
      body: { api: { apiKey: 'sk-test-0123456789', baseUrl: 'http://127.0.0.1:9/v1/' } },
    }),
    http('settings models', { path: '/api/settings/models' }),
    http('settings back', { method: 'PUT', path: '/api/settings', body: { tutor: 'claude', helpers: 'oneshot' } }),
    { name: 'terminal own page', run: (s) => terminal(s, `http://localhost:${s.port}`) },
    { name: 'terminal no origin', run: (s) => terminal(s) },
    { name: 'terminal other page', run: (s) => terminal(s, 'http://evil.test') },
    {
      name: 'mcp tools',
      run: async (s) => {
        return toolsOf(s, s.mcp!);
      },
    },
    {
      // An old bridge for the drawer and another agent: the drawer's core tools always loaded, the agent's method and
      // instructions. Only if X-Aristotle-Client and X-Aristotle-Agent are read.
      name: 'old bridge: drawer + agent',
      run: async (s) => {
        const c = await oldBridge(s, { 'X-Aristotle-Client': 'drawer', 'X-Aristotle-Agent': 'codex' });
        try {
          const tools = await toolsOf(s, c);
          const loaded = (await c.listTools()).tools.filter(
            (t) => (t._meta as Record<string, unknown> | undefined)?.['anthropic/alwaysLoad'],
          ).length;
          return { ...tools, loaded, instructions: hash(normalise(s, c.getInstructions() ?? '')) };
        } finally {
          await c.close();
        }
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
    {
      // An old bridge for a client whose calls end after a minute (Cursor): its waits come in pieces, so a question
      // nobody answers hands back "Still waiting", not "No answer yet". Only if X-Aristotle-Agent is read.
      name: 'old bridge: agent waits in pieces',
      run: async (s) => {
        const c = await oldBridge(s, { 'X-Aristotle-Agent': 'cursor' });
        try {
          const r = await c.callTool({ name: 'ask', arguments: { prompt: 'And then?', concept: 'two' } });
          return { text: hash(normalise(s, textOf(r))), inPieces: textOf(r).startsWith('Still waiting') };
        } finally {
          await c.close();
        }
      },
    },
    { name: 'record_practice', run: tool('record_practice', { results: [{ concept: 'one', outcome: 'right', kind: 'recall' }] }) },
    {
      // Right, partial and wrong on solid concepts with a card: three schedules, compared by their intervals.
      name: `record_practice solid (${solid.length})`,
      run: tool('record_practice', {
        results: solid.map((concept, i) => ({ concept, outcome: (['right', 'partial', 'wrong'] as const)[i % 3], kind: 'recall' })),
      }),
    },
    { name: 'reviews after', run: (s) => request(s, { path: '/api/reviews' }) },
    { name: 'get_topic new', run: tool('get_topic', { topic: NEW }) },
    http('state in sitting', { path: '/api/state' }),
    { name: 'end_session', run: tool('end_session', { locked: 'One.', shaky: 'Two.', next: 'Two, because it rests on one.' }) },
    http('state after', { path: '/api/state' }),
    { name: 'topic after', run: (s) => request(s, { path: `/api/topics/${NEW}` }) },
    { name: 'progress after', run: (s) => request(s, { path: '/api/progress' }) },
    { name: 'leave', run: (s) => request(s, { method: 'POST', path: '/api/leave', body: {} }) },
    {
      // ARISTOTLE_ONESHOT_CMD is `cat`: the answer is what the chat was sent (the context and the message), streamed over
      // the feed; then the chat as the interface loads it, and stopping an answer that is not being written.
      name: 'chat send + feed',
      run: (s) =>
        feed(s, async () => {
          const sent = await request(s, {
            method: 'POST',
            path: `/api/chats/${encodeURIComponent(topic)}`,
            body: { text: 'differential', where: 'The class · Step 1', page: 'What is on screen', step: '1', tags: ['x'] },
          });
          await new Promise((r) => setTimeout(r, 1500));
          return sent;
        }),
    },
    http('chat after', { path: `/api/chats/${encodeURIComponent(topic)}` }),
    http('chat stop nothing', { method: 'DELETE', path: `/api/chats/${encodeURIComponent(topic)}/answer` }),
    http('chat clear', { method: 'DELETE', path: `/api/chats/${encodeURIComponent(topic)}` }),
  ];
}

/** A result without what a cut found, or what an exact answer said: the rest, which must be the same. */
function rest(r: unknown): unknown {
  if (typeof r === 'string') return r.replace(/ found .*$/, '');
  if (r && typeof r === 'object') {
    const { found: _f, plain: _p, ...others } = r as Record<string, unknown>;
    return others;
  }
  return r;
}
const foundOf = (r: unknown): string[] =>
  typeof r === 'string' ? (r.match(/ found (.*)$/)?.[1] ?? '').split(',').filter(Boolean) : ((r as { found?: string[] })?.found ?? []);

/** Same, allowed (a cut field or an exact answer, with its reason), or different. */
function verdict(name: string, ra: unknown, rb: unknown): { ok: 'same' | 'allowed' | 'different'; mark: string } {
  if (JSON.stringify(ra) === JSON.stringify(rb)) return { ok: 'same', mark: 'same' };
  const cut = CUTS[name];
  if (cut && JSON.stringify(rest(ra)) === JSON.stringify(rest(rb))) {
    const want = expected(cut);
    const got = foundOf(rb);
    if (want.every((w) => got.includes(w)) && got.length === want.length)
      return { ok: 'allowed', mark: `allowed, only ${want.length} field(s) (${cut.why})` };
    return { ok: 'different', mark: `DIFFERENT: the new side's fields are ${JSON.stringify(got)}, not ${JSON.stringify(want)}` };
  }
  const exact = EXACT[name];
  if (exact && ra && rb && typeof ra === 'object' && typeof rb === 'object') {
    const a = ra as { status: number; type: string; security: string; location: unknown };
    const b = rb as { status: number; plain?: string; type: string; security: string; location: unknown };
    const others = a.type === b.type && a.security === b.security && a.location === b.location;
    if (others && b.status === exact.status && b.plain === exact.body && Math.floor(a.status / 100) === 4)
      return { ok: 'allowed', mark: `allowed, exactly (${exact.why})` };
  }
  return { ok: 'different', mark: 'DIFFERENT' };
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
    const { ok, mark } = verdict(step.name, ra, rb);
    if (ok === 'same') same++;
    else if (ok === 'allowed') allowed++;
    else different++;
    if (ok !== 'same' && args.includes('--show'))
      for (const [k, v] of shown)
        if (k.startsWith('ref ') && shown.get(`new ${k.slice(4)}`) !== v)
          console.log(`  ${k}\n    ${v.slice(0, 1500)}\n  new\n    ${shown.get(`new ${k.slice(4)}`)?.slice(0, 1500)}`);
    shown.clear();
    console.log(
      `${step.name.padEnd(26)} ${mark}${ok === 'different' ? `\n    ref: ${JSON.stringify(ra)}\n    new: ${JSON.stringify(rb)}` : ''}`,
    );
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
