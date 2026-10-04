// End-to-end: a real server, a real MCP client in Claude Code's place, and HTTP calls in the interface's place.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FeedState, Progress, PublicItem, ReviewQueue, SessionSummary, Topic, TopicSummary } from '../shared/types.ts';

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
    'due_reviews',
    'end_session',
    'get_topic',
    'list_topics',
    'quiz',
    'record_practice',
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

async function restart() {
  server.kill();
  await new Promise((r) => server.once('exit', r));
  await startServer();
}

test('a restarted server keeps the session and the map', async () => {
  await restart();
  const s = await get<FeedState>('/api/state');
  assert.equal(s.session?.goal, 'Wedge products');
  assert.equal(s.items.length, 1);
  assert.equal((await get<Topic>('/api/topics/differential-forms')).concepts.length, 3);
  const files = await readdir(path.join(dataDir, 'topics'));
  assert.deepEqual(files, ['differential-forms.json']);
  assert.match(await readFile(path.join(dataDir, 'topics', files[0]), 'utf8'), /"handoff"/);
});

test('solid concepts get a review schedule; practice moves it and the training level', async () => {
  await call('start_session', { topic: 'Spaced', goal: 'Test reviews' });
  await call('update_map', {
    concepts: [
      { id: 'a', label: 'A', status: 'solid' },
      { id: 'b', label: 'B', deps: ['a'] },
    ],
  });
  let topic = await get<Topic>('/api/topics/spaced');
  const a = topic.concepts.find((c) => c.id === 'a')!;
  assert.ok(a.review, 'a solid concept gets a review card');
  assert.ok(Date.parse(a.review.due) > Date.now() + 86_400_000 * 0.9, 'first review is days away, not minutes');
  assert.equal(topic.concepts.find((c) => c.id === 'b')!.review, undefined);

  assert.match(textOf(await call('due_reviews')), /Nothing is fading/);

  const right = textOf(await call('record_practice', { results: [{ concept: 'a', outcome: 'right', kind: 'recall' }] }));
  assert.match(right, /spaced\/a: right, recall was ~\d+%; next review \d{4}-\d{2}-\d{2}/);

  const wrong = textOf(await call('record_practice', { results: [{ concept: 'a', outcome: 'wrong', kind: 'recall' }] }));
  assert.match(wrong, /now shaky/);
  topic = await get<Topic>('/api/topics/spaced');
  assert.equal(topic.concepts.find((c) => c.id === 'a')!.status, 'shaky');
  assert.equal(topic.concepts.find((c) => c.id === 'a')!.review!.lapses, 1);
  const feedTypes = (await get<FeedState>('/api/state')).items.map((i) => i.type);
  assert.equal(feedTypes.at(-1), 'map');

  const level = textOf(
    await call('record_practice', { results: [{ concept: 'b', outcome: 'right', kind: 'problem' }], difficulty: 1 }),
  );
  assert.match(level, /Training level for spaced: 1 → 2\/10/);
  const miss = textOf(
    await call('record_practice', { results: [{ concept: 'b', outcome: 'wrong', kind: 'problem' }], difficulty: 2 }),
  );
  assert.match(miss, /Training level for spaced: 2 → 1\/10/);
  assert.match(textOf(await call('record_practice', { results: [{ concept: 'nope', outcome: 'right', kind: 'recall' }] })), /no such concept/);

  // Becoming solid again counts as a successful review on the same card.
  await call('update_map', { concepts: [{ id: 'a', status: 'solid' }] });
  topic = await get<Topic>('/api/topics/spaced');
  assert.equal(topic.concepts.find((c) => c.id === 'a')!.review!.reps, 4);
});

test('a concept past its review date is fading, and a review session practises it across topics', async () => {
  // Travel in time: move the review date into the past.
  const file = path.join(dataDir, 'topics', 'spaced.json');
  const topic = JSON.parse(await readFile(file, 'utf8')) as Topic;
  topic.concepts.find((c) => c.id === 'a')!.review!.due = new Date(Date.now() - 3 * 86_400_000).toISOString();
  await writeFile(file, JSON.stringify(topic));
  await restart();

  assert.match(textOf(await call('due_reviews')), /1 fading[\s\S]*spaced\/a "A" \(Spaced\): recall ~\d+%/);
  const [summary] = (await get<TopicSummary[]>('/api/topics')).filter((t) => t.slug === 'spaced');
  assert.equal(summary.fading, 1);

  const started = textOf(await call('start_session', { kind: 'review', goal: "Review what's fading" }));
  assert.match(started, /Review session .* started\. 1 concepts are fading/);
  assert.equal((await get<FeedState>('/api/state')).session?.topicSlug, '');

  const res = await call('update_map', { concepts: [{ id: 'a', status: 'solid' }] });
  assert.equal(res.isError, true, 'a review session has no topic of its own');

  const ask = call('ask', { prompt: 'Explain A', kind: 'recall', concept: 'spaced/a' });
  const open = await waitForPending('ask');
  await answer({ id: open.id, text: 'A is A.' });
  await ask;
  assert.match(textOf(await call('record_practice', { results: [{ concept: 'spaced/a', outcome: 'right', kind: 'recall' }] })), /spaced\/a: right/);

  const queue = await get<ReviewQueue>('/api/reviews');
  assert.equal(queue.fading.length, 0);
  assert.deepEqual(queue.practised.map((p) => `${p.topic}/${p.id}:${p.result}`), ['spaced/a:right']);
  const evidence = (await get<Topic>('/api/topics/spaced')).concepts.find((c) => c.id === 'a')!.evidence;
  assert.equal(evidence.at(-2)?.kind, 'ask', 'the written answer is recorded on the concept in the other topic');

  assert.match(textOf(await call('end_session', { locked: 'A', shaky: 'nothing', next: 'nothing' })), /handoff saved/);
  const sessions = await get<SessionSummary[]>('/api/sessions');
  assert.equal(sessions[0].kind, 'review');
  assert.equal(sessions[0].topicSlug, '');

  const progress = await get<Progress>('/api/progress');
  assert.ok(progress.solid.length >= 1);
  assert.equal(progress.solid.at(-1)!.count, 3, 'vector, covector and a');
  assert.ok(progress.answers.length >= 1);
  assert.deepEqual(progress.training, [{ topic: 'spaced', title: 'Spaced', level: 1 }]);
  assert.equal(progress.fading.length, 0);
});
