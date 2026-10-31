// server/bridge.ts and server/control.ts on the reference (main) against this checkout's (the core's runBridge and
// createControl): each side's bridge starts its own server when none answers (a dev instance on a free port, on its
// own copy of the data), then gets the same MCP session on stdin, as Claude Code, as another agent and as the agent
// in the drawer: initialize, the tools, a call, a cancelled call, a line that is not JSON. Then `pnpm app status`
// and `stop`. Every line written back (ids, tools, texts, normalised and hashed) and every status line must match.
//
// Galen's scripts/proofs/bridge-differential.ts is the model. Hermetic: everything out goes to a refusing proxy.
//
//   node scripts/proofs/bridge-differential.ts [--data <folder>] [--ref <ref>]

import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { compare, copyData, hash, hermeticEnv, reference, refused, refusingProxy, ROOT, sourceData, workDir } from './reference.ts';

const { dir, done } = workDir('bridge-differential');
const ref = reference(dir, true);
const proxy = await refusingProxy();

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

/** One MCP session through `root`'s bridge, as `client`; each answer reduced to what it says, hashed. */
async function session(root: string, env: NodeJS.ProcessEnv, client: string, drawer: boolean): Promise<string[]> {
  const child = spawn(process.execPath, ['server/bridge.ts'], { cwd: root, env: { ...env, ...(drawer ? { ARISTOTLE_DRAWER: '1' } : {}) } });
  const out: string[] = [];
  let buffer = '';
  child.stdout.on('data', (d) => {
    buffer += String(d);
    for (;;) {
      const i = buffer.indexOf('\n');
      if (i === -1) break;
      out.push(buffer.slice(0, i));
      buffer = buffer.slice(i + 1);
    }
  });
  const send = (m: unknown) => child.stdin.write(`${typeof m === 'string' ? m : JSON.stringify(m)}\n`);
  const wait = async (n: number) => {
    for (let i = 0; i < 150 && out.length < n; i++) await new Promise((r) => setTimeout(r, 100));
  };
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: client, version: '1' } },
  });
  await wait(1);
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  await wait(2);
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_topics', arguments: {} } });
  await wait(3);
  send('this is not json');
  send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'read_about', arguments: {} } });
  send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 4 } });
  send({ jsonrpc: '2.0', id: 5, method: 'prompts/list' });
  await wait(4);
  await new Promise((r) => setTimeout(r, 500));
  child.stdin.end();
  await new Promise((r) => child.once('exit', r));
  // id 4 is cancelled as it runs: whether its answer or the cancellation comes first is a race on both sides.
  return out
    .filter((line) => !line.includes('"id":4'))
    .map((line) => {
      const m = JSON.parse(line) as {
        id?: number;
        result?: { tools?: { name: string; _meta?: unknown }[]; [k: string]: unknown };
        error?: unknown;
      };
      if (m.result?.tools) {
        const tools = m.result.tools;
        return `id${m.id} tools ${tools.length} ${hash(tools.map((t) => t.name))} meta ${hash(tools.filter((t) => t._meta).map((t) => t.name))}`;
      }
      return `id${m.id} ${m.error ? `error ${hash(m.error)}` : `result ${hash(JSON.stringify(m.result).replaceAll(String(env.ARISTOTLE_PORT), '<port>'))}`}`;
    });
}

let code = 1;
try {
  const source = sourceData();
  const side = async (root: string, name: string) => {
    const port = await freePort();
    const data = path.join(dir, name, 'data');
    copyData(source, data);
    const env = hermeticEnv(proxy.url(name === 'ref' ? 'a' : 'b'), {
      ARISTOTLE_INSTANCE: 'dev',
      ARISTOTLE_PORT: String(port),
      ARISTOTLE_DATA_DIR: data,
      ARISTOTLE_STATE_DIR: path.join(dir, name, 'state'),
      ARISTOTLE_CLAUDE_CMD: 'bash --norc --noprofile',
    });
    const app = (command: string) => {
      const r = spawnSync(process.execPath, ['server/control.ts', command], { cwd: root, env, encoding: 'utf8' });
      return `app-${command} ${r.status} ${r.stderr.trim().replaceAll(root, '<root>').replaceAll(String(port), '<port>')}`;
    };
    const lines = [app('status')];
    // The first session finds no server and starts it (dev: not through systemd), as the bridge does at login.
    for (const [client, drawer] of [
      ['claude-code', false],
      ['codex-mcp-client', false],
      ['claude-code', true],
    ] as const)
      lines.push(`session ${client}${drawer ? ' drawer' : ''}`, ...(await session(root, env, client, drawer)));
    lines.push(app('status'), app('stop'), app('status'));
    return lines;
  };
  // The reference worktree has no interface built: the server starts without one there, and here too.
  const a = await side(ref.root, 'ref');
  const b = await side(ROOT, 'new');
  const out = refused(proxy.calls);
  console.log(out.line);
  code = compare(a, b) && !out.lopsided ? 0 : 1;
  console.log(code ? 'DIFFERENT' : 'SAME');
} finally {
  proxy.close();
  ref.remove();
  done();
}
process.exit(code);
