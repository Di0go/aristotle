// End-to-end: the tutor on a model API, and the method for any agent. A real server, a scripted stand-in for an
// OpenAI-compatible API (it answers each request with the next reply queued by the test, streamed the way APIs stream
// them), the drawer's WebSocket in the interface's place, and an MCP client in another agent's place.
//
//   pnpm test

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import WebSocket from 'ws';
import type { ChatMessage, FeedState, Gloss } from '../shared/types.ts';
import type { ModelInfo, SettingsView, TutorEntry, TutorMessage } from '../shared/tutor.ts';

let PORT = 0;
let BASE = '';
let server: ChildProcess;
let api: http.Server;
let API = '';
let dataDir: string;
let stateDir: string;

/** What the stand-in API received, newest last. */
const received: {
  messages: { role: string; content: unknown; tool_calls?: unknown; tool_call_id?: string }[];
  tools?: { function: { name: string } }[];
  model: string;
  stream?: boolean;
}[] = [];
/** The replies it will give, in order. */
const replies: Reply[] = [];
type Reply = { text?: string; calls?: { name: string; args: unknown }[]; reasoning?: string; status?: number };

before(async () => {
  [PORT] = await Promise.all([freePort()]);
  BASE = `http://localhost:${PORT}`;
  api = http.createServer(fakeApi);
  await new Promise<void>((r) => api.listen(0, '127.0.0.1', r));
  API = `http://127.0.0.1:${(api.address() as net.AddressInfo).port}/v1`;
  dataDir = await mkdtemp(path.join(tmpdir(), 'aristotle-tutor-'));
  stateDir = await mkdtemp(path.join(tmpdir(), 'aristotle-tutor-state-'));
  server = spawn('node', ['server/index.ts'], {
    env: {
      ...process.env,
      ARISTOTLE_PORT: String(PORT),
      ARISTOTLE_DATA_DIR: dataDir,
      ARISTOTLE_STATE_DIR: stateDir,
      ARISTOTLE_TLS_DIR: path.join(stateDir, 'no-tls'),
      ARISTOTLE_WAIT_MS: '5000',
      ARISTOTLE_WAIT_SLICE_MS: '1000',
      ARISTOTLE_CLAUDE_CWD: path.join(stateDir, 'claude'),
      ARISTOTLE_CLAUDE_CMD: 'bash --norc --noprofile',
      ARISTOTLE_ONESHOT_CMD: 'cat',
      ARISTOTLE_GLOSS_IMAGES: 'off',
      ARISTOTLE_API_KEY: '',
    },
    stdio: 'inherit',
  });
  for (let i = 0; i < 50; i++) {
    try {
      const health = (await (await fetch(`${BASE}/api/health`)).json()) as { pid?: number };
      if (health.pid === server.pid) return;
    } catch {}
    await sleep(100);
  }
  throw new Error('Server did not start');
});

after(async () => {
  server.kill();
  api.close();
  await rm(dataDir, { recursive: true, force: true });
  await rm(stateDir, { recursive: true, force: true });
});

// The stand-in API: /models, and /chat/completions answered with the next queued reply, streamed in small pieces.

function fakeApi(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        object: 'list',
        data: [{ id: 'fake/teacher', context_length: 64000, supported_parameters: ['tools'] }, { id: 'fake/small' }],
      }),
    );
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const request = JSON.parse(body);
    received.push(request);
    const reply = replies.shift() ?? { text: 'Nothing more to say.' };
    if (reply.status) {
      res.writeHead(reply.status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: 'stand-in refusal' } }));
      return;
    }
    if (req.url === '/v1/responses') return respond(res, reply);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish: string | null = null) =>
      res.write(
        `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`,
      );
    res.write(': keep-alive comment, as OpenRouter sends\n\n');
    chunk({ role: 'assistant', content: '' });
    if (reply.reasoning) chunk({ reasoning_content: reply.reasoning });
    for (const piece of (reply.text ?? '').match(/.{1,7}/gs) ?? []) chunk({ content: piece });
    for (const [index, call] of (reply.calls ?? []).entries()) {
      const args = JSON.stringify(call.args);
      chunk({
        tool_calls: [{ index, id: `call_${received.length}_${index}`, type: 'function', function: { name: call.name, arguments: '' } }],
      });
      // Arguments arrive in pieces, as they do from every streaming API.
      for (const piece of args.match(/.{1,11}/gs) ?? []) chunk({ tool_calls: [{ index, function: { arguments: piece } }] });
    }
    chunk({}, reply.calls?.length ? 'tool_calls' : 'stop');
    res.end('data: [DONE]\n\n');
  });
}

/** OpenAI's Responses API, streamed: a reasoning item, the text in pieces, the function calls, then the whole output. */
function respond(res: http.ServerResponse, reply: Reply) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const event = (data: Record<string, unknown>) => res.write(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
  const output: Record<string, unknown>[] = [
    { type: 'reasoning', id: `rs_${received.length}`, summary: [], encrypted_content: `secret-${received.length}` },
  ];
  if (reply.text) {
    for (const piece of reply.text.match(/.{1,5}/gs) ?? []) event({ type: 'response.output_text.delta', delta: piece });
    output.push({ type: 'message', id: `msg_${received.length}`, role: 'assistant', content: [{ type: 'output_text', text: reply.text }] });
  }
  for (const [i, call] of (reply.calls ?? []).entries()) {
    output.push({
      type: 'function_call',
      id: `fc_${i}`,
      call_id: `call_${received.length}_${i}`,
      name: call.name,
      arguments: JSON.stringify(call.args),
    });
  }
  for (const item of output) event({ type: 'response.output_item.done', item });
  event({
    type: 'response.completed',
    response: { object: 'response', status: 'completed', output, usage: { input_tokens: 10, output_tokens: 5 } },
  });
  res.end();
}

// Helpers.

const json = (method: string, route: string, body?: unknown) =>
  fetch(`${BASE}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

function openDrawer(): Promise<{ ws: WebSocket; messages: TutorMessage[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/api/terminal`, { origin: BASE });
    const messages: TutorMessage[] = [];
    ws.on('message', (raw) => messages.push(JSON.parse(String(raw)) as TutorMessage));
    ws.on('open', () => resolve({ ws, messages }));
    ws.on('error', reject);
  });
}

/** The drawer's conversation as it stands, from the messages it was sent. */
function entriesOf(messages: TutorMessage[]): TutorEntry[] {
  let entries: TutorEntry[] = [];
  for (const m of messages) {
    if (m.type === 'transcript') entries = [...m.entries];
    else if (m.type === 'entry') {
      const at = entries.findIndex((e) => e.id === m.entry.id);
      if (at === -1) entries.push(m.entry);
      else entries[at] = m.entry;
    } else if (m.type === 'delta') {
      const e = entries.find((x) => x.id === m.id);
      if (e) e.text += m.text;
    }
  }
  return entries;
}

const lastActivity = (messages: TutorMessage[]) =>
  messages.filter((m) => m.type === 'activity').at(-1) as Extract<TutorMessage, { type: 'activity' }> | undefined;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function until(check: () => boolean | Promise<boolean>, ms = 8000) {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error('Timed out');
    await sleep(30);
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

// The tests run in order on one server.

test('settings say who teaches, never hand the key back, and refuse what makes no sense', async () => {
  const fresh = (await (await fetch(`${BASE}/api/settings`)).json()) as SettingsView;
  assert.equal(fresh.tutor, 'claude-code');
  assert.equal(fresh.helpers, 'claude-code');
  assert.deepEqual(
    fresh.agents.map((a) => a.id),
    ['claude-code', 'codex', 'gemini', 'opencode'],
  );

  for (const bad of [
    { tutor: 'skynet' },
    { api: { provider: 'nope' } },
    { api: { baseUrl: 'ftp://x' } },
    { api: { baseUrl: 'https://k:s@x.test/v1' } },
  ]) {
    assert.equal((await json('PUT', '/api/settings', bad)).status, 400, JSON.stringify(bad));
  }
  // The agent's command can't be set from the interface: it is not a field the route reads.
  const sneaky = await json('PUT', '/api/settings', { agentCommand: 'rm -rf ~' });
  assert.equal(((await sneaky.json()) as SettingsView).agentCommand, undefined);

  const saved = (await (
    await json('PUT', '/api/settings', {
      tutor: 'api',
      api: { provider: 'custom', baseUrl: `${API}/`, apiKey: 'sk-test-0123456789abcd', model: 'fake/teacher' },
    })
  ).json()) as SettingsView;
  assert.equal(saved.tutor, 'api');
  assert.equal(saved.helpers, 'api', 'glosses and the chat follow the tutor onto the API');
  assert.equal(saved.api.baseUrl, API, 'the trailing slash goes');
  assert.equal(saved.api.key, 'sk-te…abcd');
  assert.ok(!JSON.stringify(saved).includes('0123456789'), 'the key never comes back');
  const file = path.join(stateDir, 'settings.json');
  assert.equal((await stat(file)).mode & 0o777, 0o600, 'only this user can read the key');
  assert.match(await readFile(file, 'utf8'), /sk-test-0123456789abcd/);

  const models = (await (await fetch(`${BASE}/api/settings/models`)).json()) as ModelInfo[];
  assert.deepEqual(models[0], { id: 'fake/small' });
  assert.deepEqual(models[1], { id: 'fake/teacher', context: 64000, tools: true });
});

test('the API tutor teaches through the same tools: a request, tool calls in one reply, then a line', async () => {
  const { ws, messages } = await openDrawer();
  await until(() => messages.some((m) => m.type === 'state'));
  const state = messages.find((m) => m.type === 'state') as Extract<TutorMessage, { type: 'state' }>;
  assert.equal(state.mode, 'api');
  assert.equal(state.running, true);
  assert.equal(state.command, 'fake/teacher');

  replies.push(
    {
      reasoning: 'They want a lesson; read the skill first.',
      calls: [{ name: 'method', args: { name: 'teach' } }],
    },
    {
      calls: [
        { name: 'start_session', args: { kind: 'learn', topic: 'Tides', goal: 'Why there are two a day' } },
        {
          name: 'show',
          args: {
            title: 'Two bulges',
            markdown: 'The Moon pulls the near side more than the far side: {{tidal force|the difference in pull across a body}}.',
            concept: 'tidal-force',
          },
        },
      ],
    },
    { text: '<think>done</think>Step one is up.' },
  );
  ws.send(JSON.stringify({ type: 'run', text: '/teach tides', initial: 'Use the teach skill to teach me: tides' }));
  await until(() => entriesOf(messages).some((e) => e.kind === 'text' && e.text === 'Step one is up.'));
  await until(() => lastActivity(messages)?.busy === false);

  // The model was given the method, the tools and the request in words.
  const first = received.at(-3)!;
  assert.equal(first.model, 'fake/teacher');
  assert.equal(first.stream, true);
  const system = String(first.messages[0]?.content);
  assert.match(system, /## When teaching/, 'the rules every sitting keeps');
  assert.match(system, /- teach: Teach the learner/, 'the skills, to read with method');
  assert.equal(first.messages.at(-1)?.content, 'Use the teach skill to teach me: tides');
  const names = first.tools!.map((t) => t.function.name);
  for (const name of ['show', 'quiz', 'ask', 'method', 'profile', 'web_search', 'read_page']) assert.ok(names.includes(name), name);
  assert.ok(!names.includes('preview_svg'), 'a model set up without vision is not offered tools that return pictures');

  // The skill came back whole, without the rules it already has.
  const skillResult = received.at(-2)!.messages.find((m) => m.role === 'tool');
  assert.match(String(skillResult?.content), /# teach\n\n# Teach/);
  assert.doesNotMatch(String(skillResult?.content), /## When teaching/);

  // Both calls ran, in order, against the real stores.
  const last = received.at(-1)!;
  const results = last.messages.filter((m) => m.role === 'tool').slice(-2);
  assert.match(String(results[0]?.content), /New topic "Tides"/);
  assert.match(String(results[1]?.content), /^Shown\./);
  const feed = (await (await fetch(`${BASE}/api/state`)).json()) as FeedState;
  assert.ok(feed.items.some((i) => i.type === 'block' && i.title === 'Two bulges'));

  // The drawer shows the conversation: the request, a line per tool, and the reply without its thinking.
  const entries = entriesOf(messages);
  assert.deepEqual(
    entries.map((e) => (e.kind === 'tool' ? `${e.tool}:${e.state}` : e.kind)),
    ['user', 'method:done', 'start_session:done', 'show:done', 'text'],
  );
  assert.equal(entries.find((e) => e.tool === 'show')?.text, 'Two bulges');
  ws.close();
});

test('a quiz waits for the learner while the model is not called, then the answer goes back to it', async () => {
  const { ws, messages } = await openDrawer();
  await until(() => messages.some((m) => m.type === 'transcript'));
  const calls = received.length;
  replies.push(
    {
      text: 'A check.',
      calls: [
        {
          name: 'quiz',
          args: {
            questions: [
              {
                question: 'How many high tides a day?',
                options: ['One', 'Two'],
                correct: 1,
                explanation: 'Two bulges.',
                concept: 'tidal-force',
              },
            ],
          },
        },
      ],
    },
    { text: 'Right: two.' },
  );
  ws.send(JSON.stringify({ type: 'send', text: 'go on' }));
  let quiz: { id: string; questions: { options: string[] }[] } | undefined;
  await until(async () => {
    const feed = (await (await fetch(`${BASE}/api/state`)).json()) as FeedState;
    quiz = feed.items.find((i) => i.type === 'quiz' && !i.answeredAt) as typeof quiz;
    return Boolean(quiz);
  });
  assert.equal(lastActivity(messages)?.doing, 'waiting for you');
  await sleep(300);
  assert.equal(received.length, calls + 1, 'no model call while the learner thinks');
  const right = quiz!.questions[0]!.options.indexOf('Two');
  await json('POST', '/api/answer', { id: quiz!.id, picks: [{ choice: right }] });
  await until(() => entriesOf(messages).some((e) => e.text === 'Right: two.'));
  const result = received.at(-1)!.messages.findLast((m) => m.role === 'tool');
  assert.match(String(result?.content), /Quiz answered: 1\/1 right/);
  ws.close();
});

test('stop ends the wait (the question stays open for collect_answers), and clear starts a new conversation', async () => {
  const { ws, messages } = await openDrawer();
  await until(() => messages.some((m) => m.type === 'transcript'));
  replies.push({
    calls: [{ name: 'ask', args: { prompt: 'Explain the far bulge in your words.', kind: 'explain', concept: 'tidal-force' } }],
  });
  ws.send(JSON.stringify({ type: 'send', text: 'another' }));
  await until(() => lastActivity(messages)?.doing === 'waiting for you');
  ws.send(JSON.stringify({ type: 'stop' }));
  await until(() => lastActivity(messages)?.busy === false);
  const entries = entriesOf(messages);
  assert.equal(entries.findLast((e) => e.kind === 'tool')?.state, 'failed');
  assert.equal(entries.at(-1)?.text, 'Stopped.');
  const feed = (await (await fetch(`${BASE}/api/state`)).json()) as FeedState;
  assert.ok(
    feed.items.some((i) => i.type === 'ask' && !i.answeredAt),
    'the question is still there to answer',
  );

  ws.send(JSON.stringify({ type: 'clear' }));
  await until(() => messages.at(-1)?.type === 'transcript' && (messages.at(-1) as { entries: unknown[] }).entries.length === 0);
  // Saved across restarts, and empty now.
  await until(async () => JSON.parse(await readFile(path.join(stateDir, 'tutor-api.json'), 'utf8')).messages.length === 0);
  ws.close();
});

test('an API error is shown in the drawer, and a slash command typed there is put in words', async () => {
  const { ws, messages } = await openDrawer();
  await until(() => messages.some((m) => m.type === 'transcript'));
  replies.push({ status: 401 });
  ws.send(JSON.stringify({ type: 'send', text: '/review' }));
  await until(() => entriesOf(messages).some((e) => e.kind === 'error'));
  assert.match(entriesOf(messages).find((e) => e.kind === 'error')!.text, /refused the key/);
  assert.equal(received.at(-1)?.messages.at(-1)?.content, 'Use the review skill.');
  ws.close();
});

test('glosses and the chat beside a lesson are written by the API too', async () => {
  replies.push({ text: 'The rise and fall of the sea, twice a day.' });
  const gloss = (await (
    await json('POST', '/api/glosses', { text: 'tide', context: 'High tide came twice.', topic: 'tides' })
  ).json()) as Gloss;
  assert.equal(gloss.text, 'tide');
  assert.match(gloss.gloss, /twice a day/);
  assert.equal(received.at(-1)?.model, 'fake/teacher');

  await json('PUT', '/api/settings', { api: { helperModel: 'fake/small' } });
  replies.push({ text: 'Because the Moon pulls the near side more.' }, { text: 'You asked about the near side.' });
  const first = (await (await json('POST', '/api/chats/tides', { text: 'why two bulges?' })).json()) as ChatMessage;
  assert.match(first.text, /near side more/);
  const second = (await (await json('POST', '/api/chats/tides', { text: 'what did I ask?' })).json()) as ChatMessage;
  assert.match(second.text, /near side/);
  const request = received.at(-1)!;
  assert.equal(request.model, 'fake/small', 'the helper model, when one is set');
  // The conversation so far goes with the new message.
  assert.deepEqual(
    request.messages.map((m) => m.role),
    ['system', 'user', 'assistant', 'user'],
  );
  assert.equal(request.messages[1]?.content, 'why two bulges?');
  assert.match(String(request.messages[3]?.content), /Their message: what did I ask\?/);
});

test('any agent can read the method and the profile through MCP; Claude Code, which has the skills, is not offered them', async () => {
  const client = new Client({ name: 'codex-mcp-client', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)));
  assert.match(client.getInstructions() ?? '', /How to teach is in `method`/);
  const listed = await client.callTool({ name: 'method', arguments: {} });
  assert.match((listed.content as { text: string }[])[0]!.text, /- teach \(skill\)/);
  assert.match((listed.content as { text: string }[])[0]!.text, /- researcher \(helper\)/);
  const teach = (await client.callTool({ name: 'method', arguments: { name: '/teach' } })).content as { text: string }[];
  assert.match(teach[0]!.text, /written for Claude Code/);
  assert.match(teach[0]!.text, /## When teaching/, 'an agent that has not read AGENTS.md gets the rules too');
  assert.match(teach[0]!.text, /# Teach/);

  const { prompts } = await client.listPrompts();
  assert.deepEqual(prompts.map((p) => p.name).sort(), ['praxis', 'review', 'roadmap', 'teach', 'train']);
  const prompt = await client.getPrompt({ name: 'train', arguments: { request: 'tides' } });
  assert.match((prompt.messages[0]!.content as { text: string }).text, /The learner's request: tides$/);

  const empty = (await client.callTool({ name: 'profile', arguments: {} })).content as { text: string }[];
  assert.match(empty[0]!.text, /No profile yet/);
  await client.callTool({ name: 'profile', arguments: { markdown: '# How they learn\n\nPictures first.' } });
  assert.equal(await readFile(path.join(dataDir, 'profile.md'), 'utf8'), '# How they learn\n\nPictures first.\n');
  await client.close();

  // Through the bridge's header, as Claude Code connects.
  const res = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'X-Aristotle-Agent': 'claude-code' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  const text = await res.text();
  const tools = (JSON.parse(text.match(/^data: (.*)$/m)?.[1] ?? text) as { result: { tools: { name: string }[] } }).result.tools;
  assert.ok(!tools.some((t) => t.name === 'method'));
  assert.ok(tools.some((t) => t.name === 'profile'));
});

test('a client that ends tool calls after a minute (Cursor) waits in pieces that add up to one wait', async () => {
  const client = new Client({ name: 'cursor-test', version: '0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), { requestInit: { headers: { 'X-Aristotle-Agent': 'cursor-agent' } } }),
  );
  const call = async (name: string, args: Record<string, unknown> = {}) =>
    ((await client.callTool({ name, arguments: args })).content as { text: string }[])[0]!.text;
  await call('start_session', { kind: 'learn', topic: 'Levers', goal: 'Why a long bar helps' });
  const asked = Date.now();
  assert.match(await call('ask', { prompt: 'Why does a longer crowbar help?', kind: 'explain' }), /^Still waiting/);
  assert.ok(Date.now() - asked < 3000, 'a piece, not the whole wait');
  const feed = (await (await fetch(`${BASE}/api/state`)).json()) as FeedState;
  const open = feed.items.find((i) => i.type === 'ask' && !i.answeredAt)!;
  const waiting = call('collect_answers', { wait: true });
  await sleep(300);
  await json('POST', '/api/answer', { id: open.id, text: 'More distance, less force.' });
  assert.match(await waiting, /More distance, less force/);

  // Unanswered, the pieces end where one long wait would: no sign of them for the whole wait.
  await call('ask', { prompt: 'And a shorter one?', kind: 'explain' });
  let last = '';
  for (let i = 0; i < 12 && !/^No answer yet/.test(last); i++) last = await call('collect_answers', { wait: true });
  assert.match(last, /^No answer yet/);
  assert.ok(Date.now() - asked > 5000);
  await client.close();
});

test("OpenAI's own API is spoken through its Responses API, with the model's reasoning sent back as it came", async () => {
  await json('PUT', '/api/settings', {
    tutor: 'api',
    api: { provider: 'openai', baseUrl: API, model: 'gpt-test', apiKey: 'sk-openai-0000111122223333' },
  });
  const { ws, messages } = await openDrawer();
  await until(() => messages.some((m) => m.type === 'transcript'));
  ws.send(JSON.stringify({ type: 'clear' }));
  replies.push({ calls: [{ name: 'list_topics', args: {} }] }, { text: 'You have one topic: Tides.' });
  ws.send(JSON.stringify({ type: 'send', text: 'what have I studied?' }));
  await until(() => entriesOf(messages).some((e) => e.kind === 'text' && e.text === 'You have one topic: Tides.'));
  const [first, second] = received.slice(-2) as unknown as {
    model: string;
    instructions: string;
    input: Record<string, unknown>[];
    tools: { name: string; type: string }[];
    store: boolean;
    include: string[];
  }[];
  assert.equal(first!.model, 'gpt-test');
  assert.equal(first!.store, false);
  assert.deepEqual(first!.include, ['reasoning.encrypted_content']);
  assert.match(first!.instructions, /## When teaching/, 'the system prompt goes in instructions');
  assert.ok(
    first!.tools.some((t) => t.type === 'function' && t.name === 'show'),
    'tools in the Responses shape',
  );
  assert.deepEqual(first!.input.at(-1), { role: 'user', content: 'what have I studied?' });
  // The second turn carries the first one's output items verbatim (its encrypted reasoning too), then the tool's result.
  const [reasoning, call] = second!.input.slice(-3);
  assert.equal(reasoning?.type, 'reasoning');
  assert.equal(reasoning?.encrypted_content, `secret-${received.length - 1}`);
  assert.equal(call?.type, 'function_call');
  const output = second!.input.at(-1) as { type: string; output: string };
  assert.equal(output.type, 'function_call_output');
  assert.match(output.output, /tides/);
  ws.close();
});

test('switching back to an agent replaces the API tutor in every drawer', async () => {
  const { ws, messages } = await openDrawer();
  await until(() => messages.some((m) => m.type === 'state'));
  await json('PUT', '/api/settings', { tutor: 'claude-code' });
  await until(() => messages.some((m) => m.type === 'state' && m.mode === 'terminal'));
  const state = messages.findLast((m) => m.type === 'state') as Extract<TutorMessage, { type: 'state' }>;
  assert.equal(state.engine, 'claude-code');
  assert.equal(state.running, false);
  ws.close();
});
