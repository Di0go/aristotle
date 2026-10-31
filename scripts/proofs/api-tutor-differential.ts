// The tutor on a model API (server/tutor-api.ts) on the reference (main) against this checkout's (the core's ApiTutor
// with Aristotle's words, rules, waits and summaries): each server, on its own copy of the data, is set to teach with
// a model API whose address is a local stand-in. The stand-in records what each server asks of it (the system prompt,
// the tools and their descriptions, the messages) and answers by script: a call of list_topics, a call of a tool that
// does not exist, then a sentence. The drawer's transcript and the stand-in's records must be the same on both sides.
// Prints hashes, never values.
//
//   node scripts/proofs/api-tutor-differential.ts [--data <folder>] [--ref <ref>]

import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import WebSocket from 'ws';
import { compare, copyData, hash, hermeticEnv, reference, refused, refusingProxy, ROOT, sourceData, workDir } from './reference.ts';

const today = new Date().toISOString().slice(0, 10);
/** What may differ between the two requests' text: the ports, today, ids. */
const plain = (t: string) =>
  t
    .replace(/localhost:\d+|127\.0\.0\.1:\d+/g, 'HOST')
    .replaceAll(today, 'TODAY')
    .replace(/call_[\w-]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'ID');

/** The stand-in's turn: by how many tool results the conversation has so far. */
function turn(body: { messages: { role: string }[] }): string {
  const tools = body.messages.filter((m) => m.role === 'tool').length;
  const delta =
    tools === 0
      ? { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'list_topics', arguments: '{}' } }] }
      : tools === 1
        ? { tool_calls: [{ index: 0, id: 'call_2', type: 'function', function: { name: 'no_such_tool', arguments: '{"x":1}' } }] }
        : { content: 'Here is where you stand.' };
  return `data: ${JSON.stringify({ choices: [{ delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: tools < 2 ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`;
}

const seen: Record<string, string[]> = { a: [], b: [] };
const model = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const side = (req.url ?? '').split('/')[1] ?? '?';
    if ((req.url ?? '').endsWith('/models')) return res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"data":[{"id":"m"}]}');
    const parsed = JSON.parse(body) as { messages: { role: string; content?: unknown }[]; tools?: unknown[] };
    const system = parsed.messages.find((m) => m.role === 'system');
    if (process.env.SHOW_DIR)
      writeFileSync(path.join(process.env.SHOW_DIR, `${side}-tools.json`), plain(JSON.stringify(parsed.tools ?? [], null, 1)));
    const n = (seen[side]?.length ?? 0) / 3;
    seen[side]?.push(
      `request${n}-system ${hash(plain(String(system?.content ?? '')))}`,
      `request${n}-tools ${parsed.tools?.length ?? 0} ${hash(plain(JSON.stringify(parsed.tools ?? [])))}`,
      `request${n}-messages ${parsed.messages.length} ${hash(plain(JSON.stringify(parsed.messages.filter((m) => m.role !== 'system'))))}`,
    );
    res.writeHead(200, { 'Content-Type': 'text/event-stream' }).end(turn(parsed));
  });
});
const modelPort = await new Promise<number>((r) => model.listen(0, '127.0.0.1', () => r((model.address() as net.AddressInfo).port)));

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

const { dir, done } = workDir('api-tutor-differential');
const ref = reference(dir, true);
const proxy = await refusingProxy();
const children: ChildProcess[] = [];
let code = 1;
try {
  const source = sourceData();
  const side = async (root: string, name: 'a' | 'b') => {
    const port = await freePort();
    const data = path.join(dir, name, 'data');
    const state = path.join(dir, name, 'state');
    copyData(source, data);
    mkdirSync(state, { recursive: true });
    const child = spawn(process.execPath, ['server/index.ts'], {
      cwd: root,
      env: hermeticEnv(proxy.url(name), {
        ARISTOTLE_PORT: String(port),
        ARISTOTLE_TLS_PORT: String(await freePort()),
        ARISTOTLE_DATA_DIR: data,
        ARISTOTLE_STATE_DIR: state,
        ARISTOTLE_TLS_DIR: path.join(state, 'tls'),
        ARISTOTLE_BACKUP: 'off',
        ARISTOTLE_WAIT_MS: '500',
      }),
      stdio: 'ignore',
    });
    children.push(child);
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(`${base}/api/health`)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const put = await fetch(`${base}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tutor: 'api',
        api: { provider: 'custom', baseUrl: `http://127.0.0.1:${modelPort}/${name}/v1`, model: 'm', apiKey: 'k' },
      }),
    });
    const lines = [`settings ${put.status}`];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/terminal`, { origin: base });
    const got: string[] = [];
    ws.on('message', (raw) => got.push(String(raw)));
    await new Promise((r) => ws.once('open', r));
    await new Promise((r) => setTimeout(r, 300));
    ws.send(JSON.stringify({ type: 'send', text: 'Where do I stand?' }));
    for (let i = 0; i < 100 && !got.some((g) => g.includes('Here is where you stand.') && g.includes('"running":false')); i++)
      await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 500));
    ws.close();
    // The drawer's messages, by type: the state lines and the entries (tool lines with their summaries, the reply).
    const msgs = got.map((g) => JSON.parse(g) as { type: string; entry?: { kind?: string; tool?: string; text?: string; state?: string } });
    for (const m of msgs)
      if (m.type === 'entry' && m.entry)
        lines.push(`entry ${m.entry.kind} ${m.entry.tool ?? ''} ${m.entry.state ?? ''} ${hash(plain(m.entry.text ?? ''))}`);
      else if (m.type !== 'delta' && m.type !== 'activity') lines.push(`${m.type} ${hash(plain(JSON.stringify(m)))}`);
    // What the drawer says it is doing, in order; when it began is a moment, one per side.
    lines.push(`activities ${hash(msgs.filter((m) => m.type === 'activity').map((m) => JSON.stringify({ ...m, since: 0 })))}`);
    if (process.env.SHOW_DIR)
      writeFileSync(
        path.join(process.env.SHOW_DIR, `${name}-activities.json`),
        msgs
          .filter((m) => m.type === 'activity')
          .map((m) => JSON.stringify(m))
          .join('\n'),
      );
    return [...lines, ...seen[name]];
  };
  const a = await side(ref.root, 'a');
  const b = await side(ROOT, 'b');
  const out = refused(proxy.calls);
  console.log(out.line);
  // 13/n: the method tool's description ends in the core's words; nothing else of the tools may change.
  const method = "the method tool's description ends 'Without `name`, lists the routines.' (the core's, 13/n)";
  code = compare(a, b, { 'request0-tools': method, 'request1-tools': method, 'request2-tools': method }) && !out.lopsided ? 0 : 1;
  console.log(code ? 'DIFFERENT' : 'SAME');
} finally {
  for (const c of children) c.kill('SIGKILL');
  model.close();
  proxy.close();
  ref.remove();
  done();
}
process.exit(code);
