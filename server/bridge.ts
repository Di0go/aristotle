// Claude Code starts this over stdio (see .mcp.json). It makes sure the Aristotle server is running, then relays
// MCP messages to it: one HTTP POST to /mcp per message, the answer (JSON, or a stream of server-sent events) written
// back line by line. Plain Node and no MCP SDK, so it is ready in about a tenth of a second.
// It also does two things a generic relay can't: a call Claude Code cancels (Esc while a question waits) closes its
// request, so the server stops waiting and the learner's answer stays for `collect_answers`; and a call whose stream
// ends without an answer (the server restarted meanwhile) gets an error back instead of hanging.
// stdout belongs to the MCP protocol: log to stderr only.

import http from 'node:http';
import { createInterface } from 'node:readline';
import { PORT } from './config.ts';
import { health, LOG_FILE, start } from './control.ts';

type Id = string | number;
interface Message {
  jsonrpc: '2.0';
  id?: Id;
  method?: string;
  params?: { requestId?: Id; clientInfo?: unknown; _meta?: Record<string, unknown>; [key: string]: unknown };
  result?: { protocolVersion?: string; [key: string]: unknown };
  error?: unknown;
}

const agent = new http.Agent({ keepAlive: true });
/** Requests waiting for their answer, by JSON-RPC id. */
const open = new Map<Id, http.ClientRequest>();
/** Calls Claude Code gave up on: no answer is owed for them. */
const cancelled = new Set<Id>();
/** The protocol version agreed in `initialize`, sent with every later request as the spec asks. */
let protocolVersion: string | undefined;
/** Whether this bridge serves the tutor in Aristotle's terminal drawer (server/terminal.ts sets it). */
const client = process.env.ARISTOTLE_DRAWER ? 'drawer' : 'terminal';
/**
 * The client's own name from `initialize` ("claude-code", "codex-mcp-client", "gemini-cli-mcp-client"…), passed on so
 * the server leaves out what a client already has (Claude Code has the skills, so no `method`).
 */
let clientName = '';

const ready = (async () => {
  if (await health()) return;
  if (!(await start())) {
    console.error(`Aristotle: the server did not start; see ${LOG_FILE}`);
    process.exit(1);
  }
})();

const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY });
lines.on('line', (line) => {
  if (!line.trim()) return;
  let message: Message;
  try {
    message = JSON.parse(line) as Message;
  } catch {
    console.error('Aristotle bridge: not JSON:', line.slice(0, 200));
    return;
  }
  if (message.method === 'notifications/cancelled' && message.params?.requestId !== undefined) {
    const id = message.params.requestId;
    cancelled.add(id);
    open.get(id)?.destroy();
    return;
  }
  void ready.then(() => relay(message));
});
lines.on('close', () => {
  for (const req of open.values()) req.destroy();
  process.exit(0);
});

/** POSTs one message and writes back everything the server answers with. */
function relay(message: Message) {
  const id = message.method !== undefined ? message.id : undefined;
  const info = (message.params?.clientInfo ?? message.params?._meta?.['io.modelcontextprotocol/clientInfo']) as
    | { name?: unknown }
    | undefined;
  if (typeof info?.name === 'string') clientName = info.name.replace(/[^\w.@/-]/g, '').slice(0, 80);
  let answered = false;
  const reply = (m: Message) => {
    if (id !== undefined && m.id === id && (m.result !== undefined || m.error !== undefined)) answered = true;
    if (m.result?.protocolVersion && message.method === 'initialize') protocolVersion = m.result.protocolVersion;
    write(m);
  };
  let finished = false;
  const finish = (reason?: string) => {
    if (id === undefined || finished) return;
    finished = true;
    open.delete(id);
    if (!answered && !cancelled.delete(id)) {
      write({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message:
            reason ??
            'Aristotle stopped before answering (it may have restarted). If this was a quiz or ask, call collect_answers to get the answer.',
        },
      });
    }
  };

  const body = JSON.stringify(message);
  const req = http.request(
    {
      host: '127.0.0.1',
      port: PORT,
      path: '/mcp',
      method: 'POST',
      agent,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(body),
        'X-Aristotle-Client': client,
        ...(clientName ? { 'X-Aristotle-Agent': clientName } : {}),
        ...(protocolVersion ? { 'Mcp-Protocol-Version': protocolVersion } : {}),
      },
    },
    (res) => {
      const type = res.headers['content-type'] ?? '';
      res.setEncoding('utf8');
      if (type.includes('text/event-stream')) {
        // Server-sent events: `data:` lines up to a blank line make one message.
        let buffer = '';
        let data: string[] = [];
        res.on('data', (chunk: string) => {
          buffer += chunk;
          let nl = buffer.indexOf('\n');
          while (nl !== -1) {
            const line = buffer.slice(0, nl).replace(/\r$/, '');
            buffer = buffer.slice(nl + 1);
            nl = buffer.indexOf('\n');
            if (line === '') {
              if (data.length) parse(data.join('\n'), reply);
              data = [];
            } else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
          }
        });
      } else {
        let text = '';
        res.on('data', (chunk: string) => (text += chunk));
        res.on('end', () => {
          if (text.trim()) parse(text, reply);
          else if (res.statusCode && res.statusCode >= 400) finish(`Aristotle answered ${res.statusCode}`);
        });
      }
      res.on('end', () => finish());
      res.on('error', () => finish());
    },
  );
  if (id !== undefined) open.set(id, req);
  req.on('error', (err) => {
    if (id !== undefined && cancelled.has(id)) return finish();
    console.error('Aristotle bridge:', err.message);
    finish(`Could not reach Aristotle: ${err.message}`);
  });
  req.end(body);
}

/** One JSON-RPC message, or a batch of them, from the server. */
function parse(text: string, reply: (m: Message) => void) {
  try {
    const value = JSON.parse(text) as Message | Message[];
    for (const m of Array.isArray(value) ? value : [value]) reply(m);
  } catch {
    console.error('Aristotle bridge: unreadable answer:', text.slice(0, 200));
  }
}

function write(m: Message) {
  process.stdout.write(`${JSON.stringify(m)}\n`);
}
