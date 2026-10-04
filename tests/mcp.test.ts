// End-to-end: a real server, a real MCP client in Claude Code's place, and HTTP calls in the interface's place.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FeedState, PublicItem } from '../shared/types.ts';

const PORT = 4799;
const BASE = `http://localhost:${PORT}`;
let server: ChildProcess;
let dataDir: string;
let client: Client;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mind-gym-test-'));
  server = spawn('node', ['server/index.ts'], {
    env: { ...process.env, GYM_PORT: String(PORT), GYM_DATA_DIR: dataDir, GYM_WAIT_MS: '1500' },
    stdio: 'inherit',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  client = new Client({ name: 'test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)));
});

after(async () => {
  await client.close();
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
});

const textOf = (result: Awaited<ReturnType<Client['callTool']>>) =>
  (result.content as { type: string; text: string }[]).map((c) => c.text).join('\n');

async function state(): Promise<FeedState> {
  return (await fetch(`${BASE}/api/state`)).json() as Promise<FeedState>;
}

async function waitForPending(type: 'quiz' | 'ask'): Promise<PublicItem> {
  for (let i = 0; i < 50; i++) {
    const item = (await state()).items.find((x) => x.type === type && !x.answeredAt);
    if (item) return item;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`No pending ${type}`);
}

async function answer(body: unknown) {
  return fetch(`${BASE}/api/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('lists the tools', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['ask', 'collect_answers', 'quiz', 'show', 'start_session']);
});

test('a session with a step, a quiz and an open question', async () => {
  await client.callTool({ name: 'start_session', arguments: { topic: 'Differential forms', goal: 'Meet covectors' } });
  await client.callTool({ name: 'show', arguments: { markdown: 'A covector eats a vector: $\\alpha(v)$.', title: 'Covectors' } });

  const quiz = client.callTool({
    name: 'quiz',
    arguments: {
      questions: [
        { question: 'What is $(3dx - 2dy)(1, 2)$?', options: ['-1', '7', '3'], correct: 0, explanation: '3·1 − 2·2 = −1', strand: 'covectors' },
        { question: 'Is a covector linear?', options: ['Yes', 'No'], correct: 0, explanation: 'By definition.' },
      ],
    },
  });
  const pending = await waitForPending('quiz');
  assert.equal(pending.type, 'quiz');
  if (pending.type !== 'quiz') return;
  // The interface must not receive the answer key before answering.
  assert.equal(pending.questions[0].correct, undefined);
  assert.equal(pending.questions[0].explanation, undefined);

  const right = pending.questions[0].options.indexOf('-1');
  const res = await answer({ id: pending.id, picks: [{ choice: right, note: 'did it in my head' }, { choice: null }] });
  assert.equal(res.status, 200);
  const graded = (await res.json()) as PublicItem;
  assert.equal(graded.type === 'quiz' && graded.questions[0].explanation, '3·1 − 2·2 = −1');

  const quizText = textOf(await quiz);
  assert.match(quizText, /1\/2 right/);
  assert.match(quizText, /Q1 \[covectors\]: right/);
  assert.match(quizText, /did it in my head/);
  assert.match(quizText, /Q2: said "I don't know"/);

  assert.equal((await answer({ id: pending.id, picks: [{ choice: 0 }, { choice: 0 }] })).status, 400);

  const ask = client.callTool({ name: 'ask', arguments: { prompt: 'Explain a 1-form.', kind: 'explain' } });
  const open = await waitForPending('ask');
  await answer({ id: open.id, text: 'A covector at every point.' });
  assert.match(textOf(await ask), /A covector at every point\./);

  const files = await readdir(path.join(dataDir, 'sessions'));
  assert.equal(files.length, 1);
  assert.match(files[0], /-differential-forms\.jsonl$/);
  const ops = (await readFile(path.join(dataDir, 'sessions', files[0]), 'utf8')).trim().split('\n');
  assert.equal(ops.length, 1 + 3 + 2 + 2); // session, 3 items, 2 answers, 2 deliveries
});

test('an answer given after the wait ends is collected later', async () => {
  const result = await client.callTool({
    name: 'ask',
    arguments: { prompt: 'Recall the definition of a 2-form.', kind: 'recall' },
  });
  assert.match(textOf(result), /No answer yet/);

  const open = await waitForPending('ask');
  await answer({ id: open.id, text: 'An antisymmetric bilinear map at each point.' });

  const late = textOf(await client.callTool({ name: 'collect_answers', arguments: {} }));
  assert.match(late, /antisymmetric bilinear/);
  assert.equal(textOf(await client.callTool({ name: 'collect_answers', arguments: {} })), 'No new answers.');
});

test('rejects requests from other sites', async () => {
  const res = await fetch(`${BASE}/api/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
    body: '{}',
  });
  assert.equal(res.status, 403);
});

test('a restarted server keeps the session', async () => {
  server.kill();
  await new Promise((r) => server.once('exit', r));
  server = spawn('node', ['server/index.ts'], {
    env: { ...process.env, GYM_PORT: String(PORT), GYM_DATA_DIR: dataDir, GYM_WAIT_MS: '1500' },
    stdio: 'inherit',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const s = await state();
  assert.equal(s.session?.topic, 'Differential forms');
  assert.equal(s.items.length, 4); // show, quiz, ask, late ask
});
