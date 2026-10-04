// The Mind Gym server: the interface, its live feed, and the MCP endpoint Claude Code connects to.
// Listens on 127.0.0.1 only.

import http from 'node:http';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ALLOWED_NAMES, ALLOWED_PORTS, HOST, PORT, UI_DIR, URL_CLEAN } from './config.ts';
import { PID_FILE } from './control.ts';
import { AnswerError, publicItem } from './feed.ts';
import { Gym } from './gym.ts';
import { createMcpServer } from './mcp.ts';
import type { AskAnswerBody, FeedEvent, QuizAnswerBody } from '../shared/types.ts';

const gym = await Gym.load();
const feed = gym.feed;

const server = http.createServer(async (req, res) => {
  try {
    // Only answer requests addressed to this machine by name, and only from our own pages:
    // stops other websites in the browser from reaching the server (DNS rebinding, CSRF).
    if (!localHost(req.headers.host) || (req.headers.origin && !localOrigin(req.headers.origin))) {
      return send(res, 403, 'Forbidden');
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/mcp') return await handleMcp(req, res);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url.pathname);
    return await serveStatic(res, url.pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 500, 'Server error');
    else res.end();
  }
});

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

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, route: string) {
  if (req.method === 'GET' && route === '/api/health') return json(res, 200, { ok: true });
  if (req.method === 'GET' && route === '/api/state') return json(res, 200, feed.state());
  if (req.method === 'GET' && route === '/api/events') return streamEvents(req, res);
  if (req.method === 'GET' && route === '/api/topics') return json(res, 200, gym.topics.list());
  if (req.method === 'GET' && route.startsWith('/api/topics/')) {
    const topic = gym.topics.get(decodeURIComponent(route.slice('/api/topics/'.length)));
    return topic ? json(res, 200, topic) : json(res, 404, { error: 'No such topic' });
  }
  if (req.method === 'GET' && route === '/api/sessions') return json(res, 200, await gym.listSessions());
  if (req.method === 'GET' && route === '/api/progress') return json(res, 200, await gym.progress());
  if (req.method === 'GET' && route === '/api/reviews') return json(res, 200, gym.reviewQueue());
  if (req.method === 'GET' && route === '/api/backup') return json(res, 200, gym.backup.state());
  if (req.method === 'GET' && route.startsWith('/api/sessions/')) {
    const record = await gym.readSession(decodeURIComponent(route.slice('/api/sessions/'.length)));
    if (!record?.session) return json(res, 404, { error: 'No such session' });
    return json(res, 200, { session: record.session, items: record.items.map(publicItem), handoff: record.handoff });
  }
  if (req.method === 'POST' && route === '/api/answer') {
    const body = (await readJson(req)) as Partial<QuizAnswerBody & AskAnswerBody> | null;
    if (!body || typeof body.id !== 'string') return json(res, 400, { error: 'Missing id' });
    try {
      const item = Array.isArray(body.picks)
        ? await gym.answerQuiz(body.id, body.picks)
        : await gym.answerAsk(body.id, String(body.text ?? ''));
      return json(res, 200, publicItem(item));
    } catch (err) {
      if (err instanceof AnswerError) return json(res, 400, { error: err.message });
      throw err;
    }
  }
  return json(res, 404, { error: 'Not found' });
}

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

async function serveStatic(res: http.ServerResponse, pathname: string) {
  const rel = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(UI_DIR, rel);
  if (!file.startsWith(UI_DIR)) return send(res, 403, 'Forbidden');
  let body: Buffer;
  try {
    body = await readFile(file);
  } catch {
    // Unknown paths get the app (single-page routing).
    file = path.join(UI_DIR, 'index.html');
    try {
      body = await readFile(file);
    } catch {
      return send(res, 503, 'The interface is not built yet. Run: pnpm build');
    }
  }
  const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
  const cache = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache }).end(body);
}

function localHost(host: string | undefined): boolean {
  if (!host) return false;
  const [name, port = '80'] = host.split(':');
  return ALLOWED_NAMES.includes(name) && ALLOWED_PORTS.includes(Number(port));
}

function localOrigin(origin: string): boolean {
  try {
    return localHost(new URL(origin).host);
  } catch {
    return false;
  }
}

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

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use: the Mind Gym is probably already running.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  mkdirSync(path.dirname(PID_FILE), { recursive: true });
  writeFileSync(PID_FILE, String(process.pid));
  console.log(`${new Date().toISOString()} Mind Gym running at ${URL_CLEAN} (http://localhost:${PORT})`);
});

function shutdown() {
  rmSync(PID_FILE, { force: true });
  server.close();
  server.closeAllConnections();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
