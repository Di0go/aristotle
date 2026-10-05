// The Aristotle server: the interface, its live feed, and the MCP endpoint Claude Code connects to.
// Listens on 127.0.0.1 only: HTTP, and HTTPS for aristotle.test when scripts/tls.sh has made its certificate.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { WebSocketServer } from 'ws';
import {
  ACCENT,
  ALLOWED_NAMES,
  ALLOWED_PORTS,
  HOST,
  HOSTNAME,
  INSTANCE,
  PORT,
  ROOT,
  TLS_DIR,
  TLS_ENABLED,
  TLS_PORT,
  TLS_TRUSTED,
  UI_DIR,
  URL_CLEAN,
} from './config.ts';
import { PID_FILE } from './control.ts';
import { AnswerError, publicItem } from './feed.ts';
import { GlossError } from './glosses.ts';
import { Gym } from './gym.ts';
import { createMcpServer } from './mcp.ts';
import { MissionError } from './missions.ts';
import { Search } from './search.ts';
import { Terminal } from './terminal.ts';
import type { AskAnswerBody, FeedEvent, GlossBody, QuizAnswerBody } from '../shared/types.ts';

const gym = await Gym.load();
const feed = gym.feed;
const search = new Search(gym);
const terminal = new Terminal();
const sockets = new WebSocketServer({ noServer: true });

/** Content types of the files the interface build is made of. */
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.json': 'application/json',
};

/** Every HTTP request: security checks first, then MCP, the API or the interface's files. */
async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    // Only answer requests addressed to this machine by name, and only from our own pages:
    // stops other websites in the browser from reaching the server (DNS rebinding, CSRF).
    if (!localHost(req.headers.host) || (req.headers.origin && !localOrigin(req.headers.origin))) {
      return send(res, 403, 'Forbidden');
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    // Once the browsers trust the certificate, pages on http://aristotle.test move to https. Not /api/: a page
    // still open over http keeps its live feed and terminal, which a redirect to another origin would break.
    if (
      TLS_TRUSTED &&
      !('encrypted' in req.socket) &&
      req.headers.host === HOSTNAME &&
      !url.pathname.startsWith('/api/') &&
      url.pathname !== '/mcp'
    ) {
      res.writeHead(307, { Location: `https://${HOSTNAME}${req.url ?? '/'}` }).end();
      return;
    }
    if (url.pathname === '/mcp') return await handleMcp(req, res);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url.pathname, url.searchParams);
    return await serveStatic(res, url.pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 500, 'Server error');
    else res.end();
  }
}

// The terminal runs Claude Code, so it is only ever reachable from Aristotle's own pages: a browser always
// sends an Origin on a WebSocket, and other sites (or a rebound DNS name) fail the Host and Origin checks.
function upgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname !== '/api/terminal' || !localHost(req.headers.host) || !req.headers.origin || !localOrigin(req.headers.origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  sockets.handleUpgrade(req, socket, head, (ws) => terminal.attach(ws));
}

/** Claude Code's MCP endpoint (POST only). */
async function handleMcp(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method !== 'POST') {
    res.writeHead(405, { Allow: 'POST' }).end();
    return;
  }
  // Stateless: a fresh server per request, so a restart never strands Claude Code's connection.
  const mcp = createMcpServer(gym);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    void transport.close();
    void mcp.close();
  });
  await mcp.connect(transport);
  await transport.handleRequest(req, res);
}

/** The interface's JSON API. Every route is listed in docs/architecture.md (generated from the checks below). */
async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, route: string, params: URLSearchParams) {
  /** The part of the route after `prefix`: a slug or an id. */
  const tail = (prefix: string) => decodeURIComponent(route.slice(prefix.length));

  // The live session
  if (req.method === 'GET' && route === '/api/health') return json(res, 200, { ok: true, instance: INSTANCE, root: ROOT });
  if (req.method === 'GET' && route === '/api/state') return json(res, 200, feed.state());
  if (req.method === 'GET' && route === '/api/events') return streamEvents(req, res);
  if (req.method === 'POST' && route === '/api/answer') {
    const body = (await readJson(req)) as Partial<QuizAnswerBody & AskAnswerBody> | null;
    if (!body || typeof body.id !== 'string') return json(res, 400, { error: 'Missing id' });
    try {
      // Whether Claude hears this answer now (a quiz or ask call is waiting), or has to be told to collect it.
      const heard = feed.awaited(body.id);
      const item = Array.isArray(body.picks)
        ? await gym.answerQuiz(body.id, body.picks)
        : await gym.answerAsk(body.id, String(body.text ?? ''));
      res.setHeader('X-Aristotle-Heard', heard ? 'yes' : 'no');
      return json(res, 200, publicItem(item));
    } catch (err) {
      if (err instanceof AnswerError) return json(res, 400, { error: err.message });
      throw err;
    }
  }

  // Topics, roadmaps and missions
  if (req.method === 'GET' && route === '/api/topics') return json(res, 200, gym.topics.list());
  if (req.method === 'GET' && route.startsWith('/api/topics/')) {
    const topic = gym.topics.get(tail('/api/topics/'));
    return topic ? json(res, 200, topic) : json(res, 404, { error: 'No such topic' });
  }
  if (req.method === 'GET' && route === '/api/map') return json(res, 200, gym.topics.all());
  if (req.method === 'GET' && route === '/api/roadmaps') return json(res, 200, gym.roadmaps.all());
  if (req.method === 'GET' && route.startsWith('/api/roadmaps/')) {
    const roadmap = gym.roadmaps.get(tail('/api/roadmaps/'));
    return roadmap ? json(res, 200, roadmap) : json(res, 404, { error: 'No such roadmap' });
  }
  if (req.method === 'GET' && route === '/api/missions') return json(res, 200, gym.missions.all());
  if (req.method === 'POST' && route.startsWith('/api/missions/')) {
    const id = tail('/api/missions/');
    const body = (await readJson(req)) as { action?: string; text?: unknown } | null;
    try {
      if (body?.action === 'debrief') {
        const text = String(body.text ?? '').trim();
        if (!text) return json(res, 400, { error: 'Write what happened first' });
        return json(res, 200, await gym.missions.debrief(id, text));
      }
      if (body?.action === 'drop' || body?.action === 'restore')
        return json(res, 200, await gym.missions.setDropped(id, body.action === 'drop'));
      return json(res, 400, { error: 'Unknown action' });
    } catch (err) {
      if (err instanceof MissionError) return json(res, 400, { error: err.message });
      throw err;
    }
  }

  // Glosses: explaining a phrase runs Claude Code, so the request waits a few seconds for the answer.
  if (req.method === 'GET' && route === '/api/glosses') return json(res, 200, gym.glosses.all());
  if (req.method === 'POST' && route === '/api/glosses') {
    const body = (await readJson(req)) as Partial<GlossBody> | null;
    if (typeof body?.text !== 'string') return json(res, 400, { error: 'Missing text' });
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    const topic = str(body.topic);
    try {
      const gloss = await gym.glosses.explain(
        { text: body.text, context: str(body.context), topic },
        topic && gym.topics.get(topic)?.title,
      );
      return json(res, 200, gloss);
    } catch (err) {
      if (err instanceof GlossError) return json(res, 400, { error: err.message });
      throw err;
    }
  }
  if (req.method === 'DELETE' && route.startsWith('/api/glosses/')) {
    const removed = await gym.glosses.remove(tail('/api/glosses/'));
    return removed ? json(res, 200, { ok: true }) : json(res, 404, { error: 'No such gloss' });
  }

  // History, progress and search
  if (req.method === 'GET' && route === '/api/sessions') return json(res, 200, await gym.listSessions());
  if (req.method === 'GET' && route.startsWith('/api/sessions/')) {
    const record = await gym.readSession(tail('/api/sessions/'));
    if (!record?.session) return json(res, 404, { error: 'No such session' });
    return json(res, 200, { session: record.session, items: record.items.map(publicItem), handoff: record.handoff });
  }
  if (req.method === 'GET' && route === '/api/progress') return json(res, 200, await gym.progress());
  if (req.method === 'GET' && route === '/api/reviews') return json(res, 200, gym.reviewQueue());
  if (req.method === 'GET' && route === '/api/search') return json(res, 200, await search.query(params.get('q') ?? ''));
  if (req.method === 'GET' && route === '/api/backup') return json(res, 200, gym.backup.state());

  return json(res, 404, { error: 'Not found' });
}

/** The live feed as server-sent events, with a ping every 20 seconds while nothing happens. */
function streamEvents(req: http.IncomingMessage, res: http.ServerResponse) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('retry: 2000\n\n');
  const onEvent = (event: FeedEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
  feed.events.on('event', onEvent);
  req.on('close', () => {
    clearInterval(ping);
    feed.events.off('event', onEvent);
  });
}

/** The built interface from dist/ui; unknown paths get index.html so the app can route them. */
async function serveStatic(res: http.ServerResponse, pathname: string) {
  const rel = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(UI_DIR, rel);
  if (!file.startsWith(UI_DIR)) return send(res, 403, 'Forbidden');
  let body: Buffer;
  try {
    body = await readFile(file);
  } catch {
    // A missing build file is a real 404 (a tab from before a rebuild asking for an old chunk): answering it with
    // the app would hand a script import an HTML page. Every other unknown path gets the app (single-page routing).
    if (rel.startsWith(`${path.sep}assets${path.sep}`) || rel.startsWith('/assets/')) return send(res, 404, 'Not found');
    file = path.join(UI_DIR, 'index.html');
    try {
      body = await readFile(file);
    } catch {
      return send(res, 503, 'The interface is not built yet. Run: pnpm build');
    }
  }
  if (ACCENT && file.endsWith(`${path.sep}index.html`))
    body = Buffer.from(body.toString('utf8').replace('<html lang="en">', `<html lang="en" data-accent="${ACCENT}">`));
  const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
  const cache = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache }).end(body);
}

/** A Host header naming this machine on one of our ports. */
function localHost(host: string | undefined): boolean {
  if (!host) return false;
  const [name, port = '80'] = host.split(':');
  return ALLOWED_NAMES.includes(name) && ALLOWED_PORTS.includes(Number(port));
}

/** An Origin header for one of our own pages. */
function localOrigin(origin: string): boolean {
  try {
    return localHost(new URL(origin).host);
  } catch {
    return false;
  }
}

/** The request body as JSON; null when it is malformed or over 1 MB. */
async function readJson(req: http.IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) return null;
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

function send(res: http.ServerResponse, status: number, message: string) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(message);
}

// Start: HTTP always, HTTPS too when there is a certificate. Both on 127.0.0.1 only.
const server = http.createServer(handle).on('upgrade', upgrade);
const tls = TLS_ENABLED
  ? https
      .createServer({ key: readFileSync(path.join(TLS_DIR, 'server.key')), cert: readFileSync(path.join(TLS_DIR, 'server.crt')) }, handle)
      .on('upgrade', upgrade)
  : undefined;

const portInUse = (port: number) => (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use: Aristotle is probably already running.`);
    process.exit(1);
  }
  throw err;
};
server.on('error', portInUse(PORT));
tls?.on('error', portInUse(TLS_PORT));

server.listen(PORT, HOST, () => {
  mkdirSync(path.dirname(PID_FILE), { recursive: true });
  writeFileSync(PID_FILE, String(process.pid));
  console.log(`${new Date().toISOString()} Aristotle (${INSTANCE}) running at ${URL_CLEAN} (http://localhost:${PORT})`);
});
tls?.listen(TLS_PORT, HOST);

/** Closes both servers and removes the pid file, so a later `pnpm app stop` never signals a stale pid. */
function shutdown() {
  rmSync(PID_FILE, { force: true });
  terminal.stop();
  for (const s of [server, tls]) {
    s?.close();
    s?.closeAllConnections();
  }
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
