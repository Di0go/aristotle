// End-to-end: a real server, a real MCP client in Claude Code's place, and HTTP calls in the interface's place.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FeedState, PublicItem, SessionSummary, Topic, TopicSummary } from '../shared/types.ts';

const PORT = 4799;
const BASE = `http://localhost:${PORT}`;
let server: ChildProcess;
let dataDir: string;
let client: Client;

async function startServer() {
  server = spawn('node', ['server/index.ts'], {
    env: { ...process.env, GYM_PORT: String(PORT), GYM_DATA_DIR: dataDir, GYM_WAIT_MS: '1500' },
    stdio: 'inherit',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server did not start');
}

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mind-gym-test-'));
  await startServer();
  client = new Client({ name: 'test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)));
});

after(async () => {
  await client.close();
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
});

type ToolResult = Awaited<ReturnType<Client['callTool']>>;
const textOf = (result: ToolResult) => (result.content as { text: string }[]).map((c) => c.text).join('\n');
const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });
const get = async <T>(route: string): Promise<T> => (await fetch(`${BASE}${route}`)).json() as Promise<T>;

async function waitForPending(type: 'quiz' | 'ask'): Promise<PublicItem> {
  for (let i = 0; i < 50; i++) {
    const item = (await get<FeedState>('/api/state')).items.find((x) => x.type === type && !x.answeredAt);
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
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    'ask',
    'collect_answers',
    'end_session',
    'get_topic',
    'list_topics',
    'quiz',
    'show',
    'start_session',
    'update_map',
  ]);
});

test('teaching tools need a session first', async () => {
  assert.equal(textOf(await call('list_topics')), 'No topics yet.');
  const res = await call('show', { markdown: 'hello' });
  assert.equal(res.isError, true);
});

test('a session builds a map, records evidence and leaves a handoff', async () => {
  assert.match(
    textOf(await call('start_session', { topic: 'Differential forms', goal: 'Meet covectors', topic_goal: 'Read Maxwell in forms' })),
    /New topic "Differential forms" \(differential-forms\)/,
  );

  const mapped = textOf(
    await call('update_map', {
      concepts: [
        { id: 'vector', label: 'Vector', status: 'solid' },
        { id: 'covector', label: 'Covector', deps: ['vector'] },
        { id: 'one-form', label: '1-form', deps: ['covector', 'Vector Fields'], goal: true },
      ],
    }),
  );
  assert.match(mapped, /added vector \(solid\)/);
  assert.match(mapped, /Prerequisites not on the map yet: vector-fields/);

  await call('show', { markdown: 'A covector eats a vector: $\\alpha(v)$.', title: 'Covectors', concept: 'covector' });

  const quiz = call('quiz', {
    questions: [
      { question: 'What is $(3dx - 2dy)(1, 2)$?', options: ['-1', '7', '3'], correct: 0, explanation: '3·1 − 2·2 = −1', concept: 'covector' },
      { question: 'Is a covector linear?', options: ['Yes', 'No'], correct: 0, explanation: 'By definition.', concept: 'nowhere' },
    ],
  });
  const pending = await waitForPending('quiz');
  assert.ok(pending.type === 'quiz');
  // The interface must not receive the answer key before answering.
  assert.equal(pending.questions[0].correct, undefined);
  assert.equal(pending.questions[0].explanation, undefined);

  const right = pending.questions[0].options.indexOf('-1');
  const res = await answer({ id: pending.id, picks: [{ choice: right, note: 'in my head' }, { choice: null }] });
  assert.equal(res.status, 200);

  const quizText = textOf(await quiz);
  assert.match(quizText, /1\/2 right/);
  assert.match(quizText, /Q1 \[covector\]: right/);
  assert.match(quizText, /in my head/);
  assert.match(quizText, /Not recorded on the map, no such concept: nowhere/);
  assert.equal((await answer({ id: pending.id, picks: [{ choice: 0 }, { choice: 0 }] })).status, 400);

  const ask = call('ask', { prompt: 'Explain a 1-form.', kind: 'explain', concept: 'one-form' });
  const open = await waitForPending('ask');
  await answer({ id: open.id, text: 'A covector at every point.' });
  assert.match(textOf(await ask), /A covector at every point\./);

  assert.match(textOf(await call('update_map', { concepts: [{ id: 'covector', status: 'solid' }] })), /covector unknown → solid/);

  const topic = await get<Topic>('/api/topics/differential-forms');
  assert.equal(topic.goal, 'Read Maxwell in forms');
  assert.equal(topic.focus, 'covector');
  const covector = topic.concepts.find((c) => c.id === 'covector')!;
  assert.equal(covector.status, 'solid');
  assert.ok(covector.solidSince);
  assert.deepEqual(covector.evidence.map((e) => e.result), ['right']);
  assert.equal(topic.concepts.find((c) => c.id === 'one-form')!.evidence[0].kind, 'ask');

  const state = await get<FeedState>('/api/state');
  assert.deepEqual(
    state.items.map((i) => i.type),
    ['map', 'block', 'quiz', 'ask', 'map'],
  );

  assert.match(textOf(await call('end_session', { locked: 'Covectors', shaky: '1-forms', next: 'Wedge product' })), /handoff saved/);
  const described = textOf(await call('get_topic', { topic: 'differential-forms' }));
  assert.match(described, /Next: Wedge product/);
  assert.match(described, /covector "Covector" \[solid\] <- vector/);
  assert.match(described, /checks: 1 right, 0 wrong, 0 don't know, 0 written/);

  const [summary] = await get<TopicSummary[]>('/api/topics');
  assert.deepEqual(summary.counts, { unknown: 1, shaky: 0, solid: 2 });
  assert.equal(summary.handoff?.next, 'Wedge product');
  assert.match(textOf(await call('list_topics')), /differential-forms: "Differential forms" \(2 solid, 0 shaky, 1 unknown; 1 sessions/);

  const [session] = await get<SessionSummary[]>('/api/sessions');
  assert.equal(session.topicSlug, 'differential-forms');
  assert.equal(session.quizRight, 1);
  assert.equal(session.quizTotal, 2);
  assert.equal(session.asks, 1);
  assert.equal(session.steps, 1);
  assert.ok(session.endedAt);
  const replay = await get<FeedState & { handoff: { next: string } }>(`/api/sessions/${session.id}`);
  assert.equal(replay.items.length, 6); // the five above plus the "Done for now" summary
  assert.equal(replay.handoff.next, 'Wedge product');
  assert.equal((await fetch(`${BASE}/api/sessions/..%2Fetc`)).status, 404);
});

test('continuing a topic reuses it', async () => {
  const res = textOf(await call('start_session', { topic: 'differential-forms', goal: 'Wedge products' }));
  assert.match(res, /existing topic/);
  assert.equal((await get<TopicSummary[]>('/api/topics')).length, 1);
  assert.equal((await get<Topic>('/api/topics/differential-forms')).sessions.length, 2);
});

test('an answer given after the wait ends is collected later', async () => {
  const result = await call('ask', { prompt: 'Recall the definition of a 2-form.', kind: 'recall' });
  assert.match(textOf(result), /No answer yet/);

  const open = await waitForPending('ask');
  await answer({ id: open.id, text: 'An antisymmetric bilinear map at each point.' });

  assert.match(textOf(await call('collect_answers')), /antisymmetric bilinear/);
  assert.equal(textOf(await call('collect_answers')), 'No new answers.');
});

test('rejects requests from other sites', async () => {
  const res = await fetch(`${BASE}/api/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
    body: '{}',
  });
  assert.equal(res.status, 403);
});

test('a restarted server keeps the session and the map', async () => {
  server.kill();
  await new Promise((r) => server.once('exit', r));
  await startServer();
  const s = await get<FeedState>('/api/state');
  assert.equal(s.session?.goal, 'Wedge products');
  assert.equal(s.items.length, 1);
  assert.equal((await get<Topic>('/api/topics/differential-forms')).concepts.length, 3);
  const files = await readdir(path.join(dataDir, 'topics'));
  assert.deepEqual(files, ['differential-forms.json']);
  assert.match(await readFile(path.join(dataDir, 'topics', files[0]), 'utf8'), /"handoff"/);
});
