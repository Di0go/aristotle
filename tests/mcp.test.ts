// End-to-end: a real server, a real MCP client in Claude Code's place, and HTTP calls in the interface's place.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import WebSocket from 'ws';
import { allowed } from '../server/images.ts';
import type { FeedState, Mission, Progress, PublicItem, ReviewQueue, Roadmap, SearchHit, SessionSummary, Topic, TopicSummary } from '../shared/types.ts';

const PORT = 4799;
const TLS_PORT = 4798;
const BASE = `http://localhost:${PORT}`;
let server: ChildProcess;
let dataDir: string;
let tlsDir: string;
let client: Client;

async function startServer() {
  server = spawn('node', ['server/index.ts'], {
    env: {
      ...process.env,
      GYM_PORT: String(PORT),
      GYM_DATA_DIR: dataDir,
      GYM_TLS_DIR: tlsDir,
      GYM_TLS_PORT: String(TLS_PORT),
      GYM_WAIT_MS: '1500',
      GYM_CLAUDE_CMD: 'bash --norc --noprofile',
      PS1: '$ ',
    },
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
  dataDir = await mkdtemp(path.join(tmpdir(), 'aristotle-test-'));
  // A certificate from the real script, marked as trusted the way setup-hostname.sh does.
  tlsDir = await mkdtemp(path.join(tmpdir(), 'aristotle-tls-'));
  assert.equal(spawnSync('bash', ['scripts/tls.sh'], { env: { ...process.env, GYM_TLS_DIR: tlsDir }, stdio: 'ignore' }).status, 0);
  await writeFile(path.join(tlsDir, 'installed'), '');
  await startServer();
  client = new Client({ name: 'test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)));
});

after(async () => {
  await client.close();
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
  await rm(tlsDir, { recursive: true, force: true });
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
    'find_images',
    'get_roadmap',
    'get_topic',
    'list_missions',
    'list_roadmaps',
    'list_topics',
    'preview_svg',
    'quiz',
    'record_practice',
    'review_mission',
    'save_mission',
    'save_roadmap',
    'show',
    'start_session',
    'update_map',
    'view_image',
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

function openTerminal(origin?: string): Promise<{ ws: WebSocket; messages: { type: string; data?: string; running?: boolean }[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/api/terminal`, origin ? { origin } : {});
    const messages: { type: string; data?: string; running?: boolean }[] = [];
    ws.on('message', (raw) => messages.push(JSON.parse(String(raw))));
    ws.on('open', () => resolve({ ws, messages }));
    ws.on('error', reject);
  });
}

async function until(check: () => boolean, ms = 5000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('Timed out');
    await new Promise((r) => setTimeout(r, 30));
  }
}

test('the terminal runs the command, takes messages, and only opens to Aristotle itself', async () => {
  await assert.rejects(openTerminal(), /403/, 'no Origin');
  await assert.rejects(openTerminal('https://example.com'), /403/, 'another site');

  const { ws, messages } = await openTerminal(BASE);
  await until(() => messages.some((m) => m.type === 'state'));
  assert.equal(messages[0].running, false);

  ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 30 }));
  ws.send(JSON.stringify({ type: 'start' }));
  await until(() => messages.some((m) => m.type === 'state' && m.running));

  ws.send(JSON.stringify({ type: 'send', text: 'echo gym-$((40+2)) $COLUMNS' }));
  const output = () => messages.filter((m) => m.type === 'output').map((m) => m.data).join('');
  await until(() => /gym-42 120/.test(output()));

  // A second window catches up on what is already on screen.
  const late = await openTerminal(BASE);
  await until(() => late.messages.some((m) => m.type === 'output' && /gym-42/.test(m.data ?? '')));
  late.ws.close();

  ws.send(JSON.stringify({ type: 'stop' }));
  await until(() => messages.some((m) => m.type === 'state' && m.running === false && messages.indexOf(m) > 0));
  ws.close();
});

test('preview_svg renders an SVG to a PNG in either theme', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><line x1="10" y1="20" x2="110" y2="20" stroke="currentColor"/><text x="10" y="15" fill="currentColor">v</text></svg>';
  for (const dark of [false, true]) {
    const res = await call('preview_svg', { svg, dark });
    const [image] = res.content as { type: string; data: string; mimeType: string }[];
    assert.equal(image.type, 'image');
    assert.equal(image.mimeType, 'image/png');
    assert.equal(Buffer.from(image.data, 'base64').subarray(1, 4).toString(), 'PNG');
  }
  const bad = await call('preview_svg', { svg: '<svg><line' });
  assert.equal(bad.isError, true);
  assert.match(textOf(bad), /Could not render/);
});

test('run starts the command with the request as its first message, or types it in when running', async () => {
  const { ws, messages } = await openTerminal(BASE);
  await until(() => messages.some((m) => m.type === 'state'));
  const output = () => messages.filter((m) => m.type === 'output').map((m) => m.data).join('');

  // Not running: the request becomes an argument. Bash takes it as a script path, which shows it arrived intact.
  ws.send(JSON.stringify({ type: 'run', text: '/teach the french revolution', initial: 'Use the teach skill to teach me: the french revolution' }));
  await until(() => /bash: Use the teach skill to teach me: the french revolution: /.test(output()));
  await until(() => messages.some((m) => m.type === 'exit'));

  // Running: the request is typed in.
  ws.send(JSON.stringify({ type: 'start' }));
  await until(() => messages.filter((m) => m.type === 'state' && m.running).length >= 2);
  ws.send(JSON.stringify({ type: 'run', text: 'echo typed-$((6*7))' }));
  await until(() => /typed-42/.test(output()));
  ws.send(JSON.stringify({ type: 'stop' }));
  ws.close();
});

/** A request to aristotle.test, the way the browser makes it once nftables has forwarded it to the server. */
function requestName(secure: boolean, route: string, ca?: Buffer): Promise<{ status: number; location?: string; body: string }> {
  return new Promise((resolve, reject) => {
    const options = { host: '127.0.0.1', port: secure ? TLS_PORT : PORT, path: route, headers: { host: 'aristotle.test' } };
    const req = secure ? https.get({ ...options, servername: 'aristotle.test', ca }) : http.get(options);
    req.on('response', (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode!, location: res.headers.location, body }));
    });
    req.on('error', reject);
  });
}

test('aristotle.test is served over https with its own certificate, and its pages move there from http', async () => {
  const ca = await readFile(path.join(tlsDir, 'ca.crt'));
  const page = await requestName(true, '/topics', ca);
  assert.equal(page.status, 200);
  assert.deepEqual(JSON.parse((await requestName(true, '/api/health', ca)).body), { ok: true });
  await assert.rejects(requestName(true, '/', undefined), /self-signed|unable to (get|verify)/, 'only its own authority vouches for it');

  assert.deepEqual(await requestName(false, '/topics?x=1', ca), { status: 307, location: 'https://aristotle.test/topics?x=1', body: '' });
  assert.equal((await requestName(false, '/api/health')).status, 200, 'a page still open over http keeps its feed');
  assert.equal((await fetch(`${BASE}/`)).status, 200, 'localhost stays on http');

  // ws hands servername on to tls.connect, though its types leave it out.
  const tlsOptions: WebSocket.ClientOptions = { ca, servername: 'aristotle.test', headers: { host: 'aristotle.test' }, origin: 'https://aristotle.test' } as WebSocket.ClientOptions;
  const ws = new WebSocket(`wss://127.0.0.1:${TLS_PORT}/api/terminal`, tlsOptions);
  await new Promise((resolve, reject) => ws.on('open', resolve).on('error', reject));
  ws.close();
});

test('a roadmap orders topics and reads its progress off their maps', async () => {
  assert.equal(textOf(await call('list_roadmaps')), 'No roadmaps yet.');
  const steps = [
    { title: 'Forms first', goal: 'Read a 1-form', topic: 'differential-forms', why: 'Everything else uses them' },
    { title: 'Stokes theorem', goal: 'Prove Stokes for a square' },
  ];
  const saved = textOf(await call('save_roadmap', { title: 'Geometry path', goal: 'Read Maxwell in forms', steps }));
  assert.match(saved, /Roadmap created/);
  assert.match(saved, /\[DRAFT/);
  assert.match(saved, /1\. Forms first \(topic differential-forms\) \[started/);
  assert.match(saved, /2\. Stokes theorem \(topic stokes-theorem\) \[not started\]/);

  const [roadmap] = await get<Roadmap[]>('/api/roadmaps');
  assert.equal(roadmap.slug, 'geometry-path');
  assert.equal(roadmap.status, 'draft');
  assert.deepEqual(roadmap.steps.map((s) => s.topic), ['differential-forms', 'stokes-theorem']);

  // Revising replaces the steps and keeps the roadmap's identity.
  const revised = textOf(
    await call('save_roadmap', { roadmap: 'geometry-path', title: 'Geometry path', goal: 'Read Maxwell in forms', status: 'active', steps: steps.reverse() }),
  );
  assert.match(revised, /Roadmap updated/);
  const after = await get<Roadmap>('/api/roadmaps/geometry-path');
  assert.equal(after.status, 'active');
  assert.equal(after.created, roadmap.created);
  assert.equal(after.steps[0].topic, 'stokes-theorem');
  assert.equal((await call('save_roadmap', { roadmap: 'nope', title: 'X', goal: 'Y', steps })).isError, true);

  // A lesson on a step learns where it sits on the path.
  const started = textOf(await call('start_session', { topic: 'Stokes theorem', goal: 'Start the step' }));
  assert.match(started, /step 1 of 2 of the roadmap "Geometry path"/);
  assert.match(started, /It is the first step/);
  assert.match(textOf(await call('get_topic', { topic: 'differential-forms' })), /step 2 of 2 .*Earlier steps: stokes-theorem \(started\)/);
  assert.match(textOf(await call('list_roadmaps')), /geometry-path: "Geometry path" \(0\/2 steps done\) \| next: Stokes theorem/);
  assert.ok(await readFile(path.join(dataDir, 'roadmaps', 'geometry-path.json'), 'utf8'));
});

test('images: only licences that allow reuse get through', () => {
  for (const ok of ['Public domain', 'PD-old', 'CC0', 'CC BY 4.0', 'CC BY-SA 3.0', 'CC-BY-SA-4.0']) assert.equal(allowed(ok), true, ok);
  for (const no of ['', 'CC BY-NC 4.0', 'CC BY-NC-SA 4.0', 'CC BY-ND 2.0', 'Fair use', 'All rights reserved', 'Copyrighted free use']) {
    assert.equal(allowed(no), false, no || '(none)');
  }
  assert.equal(allowed('CC BY 4.0', 'personality'), false, 'restricted');
});

test('a question can carry the step that leads into it, in one call', async () => {
  await call('start_session', { topic: 'Differential forms', goal: 'One call per step' });
  const res = textOf(await call('ask', { prompt: 'Why?', kind: 'explain', lead: { markdown: 'Here is the step.', title: 'The step', concept: 'vector' } }));
  assert.match(res, /No answer yet/);
  const items = (await get<FeedState>('/api/state')).items;
  const [step, ask] = items.slice(-2);
  assert.equal(step.type, 'block');
  assert.equal(step.type === 'block' && step.markdown, 'Here is the step.');
  assert.equal(ask.type, 'ask');
});

test('a Praxis mission is set, debriefed in the interface, and reviewed into practice', async () => {
  const post = (id: string, body: unknown) =>
    fetch(`${BASE}/api/missions/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const mission = {
    title: 'Rewrite the field equations in forms',
    scope: 'step',
    roadmap: 'geometry-path',
    topic: 'differential-forms',
    arena: 'anywhere',
    why: 'Maxwell in two lines.',
    brief: 'Take [[covector]] and write $dF = 0$.',
    criteria: ['Both equations written as forms'],
    concepts: ['covector', 'differential-forms/vector', 'differential-forms/nope'],
  };
  assert.equal((await call('save_mission', { ...mission, topic: undefined })).isError, true, 'a step mission needs its topic');
  const saved = textOf(await call('save_mission', mission));
  assert.match(saved, /Mission created .*#\/praxis\/rewrite-the-field-equations-in-forms/);
  assert.match(saved, /Not on any map: differential-forms\/nope/);
  assert.match(textOf(await call('get_roadmap', { roadmap: 'geometry-path' })), /Praxis missions:\n- rewrite-the-field-equations-in-forms: .*\[open\]/);

  // Nothing to review until he debriefs.
  assert.equal((await call('review_mission', { mission: 'rewrite-the-field-equations-in-forms', verdict: 'achieved', critique: 'x' })).isError, true);
  assert.equal((await post('rewrite-the-field-equations-in-forms', { action: 'debrief', text: '  ' })).status, 400);
  const debriefed = (await (await post('rewrite-the-field-equations-in-forms', { action: 'debrief', text: 'Did both; dF = 0 and d*F = J.' })).json()) as Mission;
  assert.equal(debriefed.status, 'debriefed');
  assert.match(textOf(await call('list_missions', { status: 'debriefed' })), /rewrite-the-field-equations-in-forms/);
  assert.match(textOf(await call('list_missions', { mission: 'rewrite-the-field-equations-in-forms' })), /His debrief .*\n.*dF = 0 and d\*F = J/);

  const reviewed = textOf(
    await call('review_mission', {
      mission: 'rewrite-the-field-equations-in-forms',
      verdict: 'partly',
      critique: 'Sound on the first.',
      results: [{ concept: 'vector', outcome: 'wrong' }, { concept: 'covector', outcome: 'right' }],
    }),
  );
  assert.match(reviewed, /Reviewed \(partly\)/);
  assert.match(reviewed, /differential-forms\/vector: wrong, now shaky/);
  const topic = await get<Topic>('/api/topics/differential-forms');
  const vector = topic.concepts.find((c) => c.id === 'vector')!;
  assert.equal(vector.status, 'shaky');
  assert.equal(vector.evidence.at(-1)?.practice, 'mission');
  assert.match(textOf(await call('get_topic', { topic: 'differential-forms' })), /used in Praxis: wrong/);

  const [stored] = await get<Mission[]>('/api/missions');
  assert.equal(stored.status, 'reviewed');
  assert.equal(stored.review?.verdict, 'partly');

  // Rewriting the brief keeps what happened; dropping and restoring keep it too.
  await call('save_mission', { ...mission, mission: stored.id, why: 'Maxwell, short.' });
  const rewritten = await get<Mission[]>('/api/missions');
  assert.equal(rewritten.length, 1);
  assert.equal(rewritten[0].why, 'Maxwell, short.');
  assert.equal(rewritten[0].status, 'reviewed');
  assert.equal(((await (await post(stored.id, { action: 'drop' })).json()) as Mission).status, 'dropped');
  assert.equal((await post(stored.id, { action: 'debrief', text: 'more' })).status, 400);
  assert.equal(((await (await post(stored.id, { action: 'restore' })).json()) as Mission).status, 'reviewed');
  assert.equal((await post('nope', { action: 'drop' })).status, 400);
  assert.ok(await readFile(path.join(dataDir, 'missions', `${stored.id}.json`), 'utf8'));
});

test('search finds roadmaps, concepts, missions and what was said in sessions', async () => {
  const search = (q: string) => get<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}`);
  assert.deepEqual(await search('  '), []);

  const [first] = await search('geometry');
  assert.equal(first.kind, 'roadmap');
  assert.equal(first.slug, 'geometry-path');

  const covector = (await search('COVECTOR')).find((h) => h.kind === 'concept');
  assert.equal(covector?.slug, 'differential-forms');
  assert.equal(covector?.concept, 'covector');

  assert.ok((await search('field equations')).some((h) => h.kind === 'mission' && h.id === 'rewrite-the-field-equations-in-forms'));

  // A step's text, and his own answer, in any order of words.
  const said = await search('eats vector');
  assert.ok(said.some((h) => h.kind === 'session' && h.title === 'Covectors' && /eats a vector/.test(h.snippet ?? '')));
  assert.ok((await search('every point covector')).some((h) => h.kind === 'session'));
  assert.deepEqual(await search('zzzz-nothing'), []);
});
