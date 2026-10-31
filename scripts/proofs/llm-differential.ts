// server/llm.ts and server/web.ts on the reference (main) against this checkout's (the core's, with Aristotle's
// identity and user agent): each calls a local stand-in for OpenRouter (its address carries "openrouter.ai" in the
// path, so the identity headers go), the same calls in the same order, and the stand-in records every request: method, path, the headers that say who calls, and the body. Both sides' records and answers must be
// the same. The web module is asked for a page on this machine, which both refuse, and which addresses are public.
// The user agent the web module reads as is compared apart: main's whole string against the core's with Aristotle's
// name. Hermetic: nothing leaves this machine (the stand-in is on 127.0.0.1).
//
//   node scripts/proofs/llm-differential.ts [--ref <ref>]

import { spawn } from 'node:child_process';
import http from 'node:http';
import type net from 'node:net';
import path from 'node:path';
import { compare, hash, hermeticEnv, reference, refused, refusingProxy, ROOT, workDir } from './reference.ts';

if (process.argv[2] === '--run') {
  const [, , , root = '', base = ''] = process.argv;
  const llm = await import(path.join(root, 'server/llm.ts'));
  const endpoint = { baseUrl: `${base}/openrouter.ai/api/v1`, apiKey: 'sk-or-test', model: 'some/model' };
  const out: string[] = [];
  const said = async (name: string, p: Promise<unknown>) =>
    out.push(
      `${name} ${await p.then(
        (v) => hash(JSON.stringify(v)),
        (e: Error) => `error ${e.constructor.name} ${hash(e.message)}`,
      )}`,
    );
  await said('listModels', llm.listModels(endpoint));
  await said('complete', llm.complete(endpoint, 'You are terse.', 'Say ok.'));
  await said(
    'chat',
    llm.chat(endpoint, {
      messages: [{ role: 'user', content: 'Use the tool.' }],
      tools: [{ type: 'function', function: { name: 'f', description: 'A tool', parameters: { type: 'object', properties: {} } } }],
    }),
  );
  await said('local model', llm.listModels({ baseUrl: `${base}/v1` }));
  // The web: never this machine (a page can't steer the tutor into Aristotle's own API).
  const web = await import(path.join(root, 'server/web.ts'));
  await said('read local page', web.readPage(`${base}/page`));
  out.push(`public ${['1.1.1.1', '127.0.0.1', '192.168.1.1', '::1', '169.254.1.1', '2606:4700::1'].map((u) => web.isPublic(u)).join(',')}`);
  console.log(out.join('\n'));
  process.exit(0);
}

/** The stand-in: models, a streamed answer, and what was asked of it, by side (the path's first part). */
const seen: Record<string, string[]> = { a: [], b: [] };
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const [, side = '?', ...rest] = (req.url ?? '').split('/');
    const route = `/${rest.join('/')}`;
    const who = ['x-title', 'http-referer', 'authorization', 'content-type', 'user-agent']
      .map((h) => `${h}=${req.headers[h] ?? ''}`)
      .join(' ');
    seen[side]?.push(`${req.method} ${route} ${who.replace(/node|undici/gi, 'fetch')} body ${hash(body)}`);
    if (route.endsWith('/models'))
      return res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"data":[{"id":"some/model","context_length":32768}]}');
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })}\n\ndata: [DONE]\n\n`);
  });
});
const port = await new Promise<number>((r) => server.listen(0, '127.0.0.1', () => r((server.address() as net.AddressInfo).port)));
const { dir, done } = workDir('llm-differential');
const ref = reference(dir);
const proxy = await refusingProxy();
let code = 1;
try {
  // Asynchronously: the stand-in answers from this process, which a synchronous spawn would block.
  const run = (root: string, side: 'a' | 'b') =>
    new Promise<string[]>((resolve, reject) => {
      const child = spawn(process.execPath, [import.meta.filename, '--run', root, `http://127.0.0.1:${port}/${side}`], {
        cwd: ROOT,
        env: hermeticEnv(proxy.url(side), { ARISTOTLE_STATE_DIR: path.join(dir, side), ARISTOTLE_DATA_DIR: path.join(dir, side) }),
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      child.on('exit', (status) =>
        status === 0 ? resolve([...stdout.trim().split('\n'), ...seen[side].map((l, i) => `request${i} ${l}`)]) : reject(new Error(stderr)),
      );
    });
  const same = compare(await run(ref.root, 'a'), await run(ROOT, 'b'));
  const out = refused(proxy.calls);
  console.log(out.line);
  code = same && !out.lopsided ? 0 : 1;
  console.log(code ? 'DIFFERENT' : 'SAME');
} finally {
  server.close();
  proxy.close();
  ref.remove();
  done();
}
process.exit(code);
