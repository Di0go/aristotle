// Talking to a model behind an OpenAI-compatible API: Chat Completions, streamed, with tools. That one shape is
// spoken by OpenRouter, Ollama, LM Studio, llama.cpp's server, vLLM and most others, so any model, hosted or local,
// can teach (tutor-api.ts) and write glosses, answers on a passage (oneshot.ts) and the chat (chat.ts). OpenAI's own
// API gets its Responses API instead, the only one its newest models call tools through; the conversation is kept in
// the Chat Completions shape either way. Plain fetch, no SDK.

import type { ModelInfo } from '../shared/tutor.ts';

export interface Endpoint {
  baseUrl: string;
  apiKey?: string;
  model: string;
  /** Which API to speak: Chat Completions (the default), or OpenAI's Responses API. */
  protocol?: 'chat' | 'responses';
}

export type LlmPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface LlmToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
  /** Whatever else a provider attaches to a call (Gemini's thought signatures), sent back as it came. */
  [extra: string]: unknown;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | LlmPart[] | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
  /** OpenRouter's record of the model's reasoning, passed back so a model that thinks between tool calls keeps its thread. */
  reasoning_details?: unknown[];
  /** The Responses API's own output items for this turn (its reasoning included), sent back as they came. Never sent to Chat Completions. */
  responses?: unknown[];
}

export interface LlmTool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface Completion {
  text: string;
  toolCalls: LlmToolCall[];
  reasoning: string;
  reasoningDetails?: unknown[];
  /** The Responses API's output items, to keep with the turn. */
  output?: unknown[];
  finish: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface ChatOptions {
  messages: LlmMessage[];
  tools?: LlmTool[];
  signal?: AbortSignal;
  /** Text as it is written. */
  onText?: (text: string) => void;
  /** Reasoning as it is written (models that think aloud), only to show that it is thinking. */
  onReasoning?: (text: string) => void;
  maxTokens?: number;
  temperature?: number;
}

/** What went wrong, with what kind of problem it is when that changes what to do next. */
export class LlmError extends Error {
  readonly status?: number;
  /** context: the conversation is too long for the model; tools: the model can't call tools; images: it can't see. */
  readonly kind?: 'context' | 'tools' | 'images' | 'auth';
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
    this.kind = kindOf(message, status);
  }
}

/** A local model may take minutes over a long prompt before its first word; past this with nothing at all, give up. */
const IDLE_MS = 10 * 60_000;
const ATTEMPTS = 3;

/**
 * One model turn: streamed when the API streams, the whole answer otherwise. No tool_choice and no sampling settings
 * unless asked: several APIs refuse a forced tool or a temperature, and every one defaults to choosing for itself.
 */
export async function chat(endpoint: Endpoint, options: ChatOptions): Promise<Completion> {
  if (endpoint.protocol === 'responses') return responsesTurn(endpoint, options);
  const body: Record<string, unknown> = {
    model: endpoint.model,
    messages: options.messages.map(({ responses: _kept, ...m }) => m),
    stream: true,
    ...(options.tools?.length ? { tools: options.tools } : {}),
    ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  };
  return read(await postRetrying(endpoint, '/chat/completions', body, options.signal), options);
}

/** A POST, tried again after a pause when the API is busy or failing (429, 5xx), honouring Retry-After. */
async function postRetrying(endpoint: Endpoint, route: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  let wait = 1500;
  for (let attempt = 1; ; attempt++) {
    const res = await post(endpoint, route, body, signal);
    if (res.ok) return res;
    const message = await errorOf(res);
    const retry = (res.status === 429 || res.status >= 500) && attempt < ATTEMPTS;
    if (!retry) throw new LlmError(message, res.status);
    const after = Number(res.headers.get('retry-after'));
    await sleep(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 30_000) : wait, signal);
    wait *= 3;
  }
}

// OpenAI's Responses API

/**
 * One turn on the Responses API, stateless (store: false): the whole conversation goes each time, with the model's
 * earlier output items (its encrypted reasoning among them) sent back as they came.
 */
async function responsesTurn(endpoint: Endpoint, options: ChatOptions): Promise<Completion> {
  const instructions = options.messages
    .filter((m) => m.role === 'system')
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join('\n\n');
  const body: Record<string, unknown> = {
    model: endpoint.model,
    ...(instructions ? { instructions } : {}),
    input: options.messages.filter((m) => m.role !== 'system').flatMap(toInput),
    stream: true,
    store: false,
    include: ['reasoning.encrypted_content'],
    ...(options.tools?.length
      ? {
          tools: options.tools.map((t) => ({
            type: 'function',
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters,
            strict: false,
          })),
        }
      : {}),
    ...(options.maxTokens ? { max_output_tokens: options.maxTokens } : {}),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  };
  let res: Response;
  try {
    res = await postRetrying(endpoint, '/responses', body, options.signal);
  } catch (err) {
    // A model that doesn't reason may refuse to be asked for its reasoning: ask again without.
    if (!(err instanceof LlmError) || err.status !== 400 || !/encrypted_content|include/i.test(err.message)) throw err;
    delete body.include;
    res = await postRetrying(endpoint, '/responses', body, options.signal);
  }
  return readResponses(res, options);
}

/** A message in the conversation as Responses input items. */
function toInput(m: LlmMessage): unknown[] {
  if (m.role === 'tool') return [{ type: 'function_call_output', call_id: m.tool_call_id, output: textOf(m.content) }];
  if (m.role === 'assistant') {
    if (m.responses?.length) return m.responses;
    const items: unknown[] = [];
    const text = textOf(m.content);
    if (text) items.push({ role: 'assistant', content: text });
    for (const c of m.tool_calls ?? [])
      items.push({ type: 'function_call', call_id: c.id, name: c.function.name, arguments: c.function.arguments });
    return items;
  }
  if (typeof m.content === 'string' || m.content === null) return [{ role: 'user', content: m.content ?? '' }];
  return [
    {
      role: 'user',
      content: m.content.map((p) =>
        p.type === 'text' ? { type: 'input_text', text: p.text } : { type: 'input_image', image_url: p.image_url.url },
      ),
    },
  ];
}

function textOf(content: LlmMessage['content']): string {
  if (typeof content === 'string') return content;
  return (content ?? []).map((p) => (p.type === 'text' ? p.text : '')).join('\n');
}

/** The Responses stream: text and reasoning summaries as they come, and the finished output items at the end. */
async function readResponses(res: Response, options: ChatOptions): Promise<Completion> {
  const out: Completion = { text: '', toolCalls: [], reasoning: '', finish: null };
  let output: Record<string, unknown>[] | undefined;
  const done: Record<string, unknown>[] = [];
  await events(res, (event) => {
    const type = event.type as string | undefined;
    if (type === 'response.output_text.delta' && typeof event.delta === 'string') {
      out.text += event.delta;
      options.onText?.(event.delta);
    } else if (type === 'response.reasoning_summary_text.delta' && typeof event.delta === 'string') {
      out.reasoning += event.delta;
      options.onReasoning?.(event.delta);
    } else if (type === 'response.output_item.done' && typeof event.item === 'object' && event.item) {
      done.push(event.item as Record<string, unknown>);
    } else if (type === 'response.completed' || type === 'response.incomplete') {
      const response = event.response as {
        output?: Record<string, unknown>[];
        usage?: { input_tokens?: number; output_tokens?: number };
        incomplete_details?: { reason?: string };
      };
      output = response.output;
      if (response.usage) out.usage = { prompt_tokens: response.usage.input_tokens, completion_tokens: response.usage.output_tokens };
      out.finish = type === 'response.completed' ? 'stop' : (response.incomplete_details?.reason ?? 'incomplete');
    } else if (type === 'response.failed' || type === 'error') {
      const e = (event.response as { error?: unknown } | undefined)?.error ?? event.error ?? event;
      throw new LlmError(errorText(e));
    }
  });
  const items = output ?? done;
  out.output = items;
  const said = items
    .filter((i) => i.type === 'message')
    .flatMap((i) => (Array.isArray(i.content) ? (i.content as { type?: string; text?: string }[]) : []))
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text ?? '')
    .join('');
  if (said && !out.text) {
    out.text = said;
    options.onText?.(said);
  }
  out.toolCalls = items
    .filter((i) => i.type === 'function_call')
    .map((i) => ({
      id: String(i.call_id),
      type: 'function' as const,
      function: { name: String(i.name), arguments: String(i.arguments ?? '') },
    }));
  if (out.toolCalls.length) out.finish = 'tool_calls';
  return out;
}

/** Each JSON event of a server-sent event stream, in order; a JSON body counts as one. */
async function events(res: Response, each: (event: Record<string, unknown>) => void) {
  if (!(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const body = (await res.json()) as Record<string, unknown>;
    each(
      body.object === 'response'
        ? { type: body.status === 'completed' ? 'response.completed' : 'response.incomplete', response: body }
        : body,
    );
    return;
  }
  const reader = res.body?.getReader();
  if (!reader) throw new LlmError('The API sent an empty answer');
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await withIdle(reader.read());
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf('\n');
      while (nl !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf('\n');
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(data) as Record<string, unknown>;
        } catch {
          continue;
        }
        each(event);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** A read that gives up when nothing at all has come for IDLE_MS. */
function withIdle<T>(read: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const idle = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LlmError('The model stopped answering')), IDLE_MS);
  });
  return Promise.race([read, idle]).finally(() => clearTimeout(timer));
}

/** A single answer to `request` under the instructions in `system`, streamed to `onText` when given. */
export async function complete(
  endpoint: Endpoint,
  system: string,
  request: string,
  { signal, onText, history = [] }: { signal?: AbortSignal; onText?: (t: string) => void; history?: LlmMessage[] } = {},
): Promise<string> {
  const { text } = await chat(endpoint, {
    messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: request }],
    signal,
    onText,
  });
  return stripThinking(text).trim();
}

/** The models the API offers, with what it says about each. */
export async function listModels(endpoint: Omit<Endpoint, 'model'>, signal?: AbortSignal): Promise<ModelInfo[]> {
  const res = await request(endpoint, '/models', { method: 'GET', signal });
  if (!res.ok) throw new LlmError(await errorOf(res), res.status);
  const body = (await res.json()) as { data?: unknown; models?: unknown };
  const list = Array.isArray(body.data) ? body.data : Array.isArray(body.models) ? body.models : [];
  return list
    .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null && typeof (m as { id?: unknown }).id === 'string')
    .map((m) => {
      const params = Array.isArray(m.supported_parameters) ? (m.supported_parameters as unknown[]) : undefined;
      const modalities = (m.architecture as { input_modalities?: unknown } | undefined)?.input_modalities;
      const context = Number(m.context_length ?? (m.top_provider as { context_length?: unknown } | undefined)?.context_length);
      return {
        id: m.id as string,
        ...(typeof m.name === 'string' && m.name !== m.id ? { name: m.name } : {}),
        ...(Number.isFinite(context) && context > 0 ? { context } : {}),
        ...(params ? { tools: params.includes('tools') } : {}),
        ...(Array.isArray(modalities) ? { vision: modalities.includes('image') } : {}),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Models that think in the open put it in <think>…</think> before the answer; the reader wants only the answer. */
export function stripThinking(text: string): string {
  return text.replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '');
}

function post(endpoint: Endpoint, route: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return request(endpoint, route, { method: 'POST', body: JSON.stringify(body), signal });
}

async function request(
  endpoint: Omit<Endpoint, 'model'>,
  route: string,
  { method, body, signal }: { method: string; body?: string; signal?: AbortSignal },
): Promise<Response> {
  const headers: Record<string, string> = { Accept: body ? 'text/event-stream, application/json' : 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (endpoint.apiKey) headers.Authorization = `Bearer ${endpoint.apiKey}`;
  // OpenRouter lists apps that say who they are; nothing about the learner goes in these.
  if (/openrouter\.ai/.test(endpoint.baseUrl)) {
    headers['HTTP-Referer'] = 'https://github.com/Di0go/aristotle';
    headers['X-Title'] = 'Aristotle';
  }
  try {
    return await fetch(`${endpoint.baseUrl.replace(/\/+$/, '')}${route}`, { method, headers, body, signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    const why =
      cause?.code === 'ECONNREFUSED'
        ? 'nothing is listening there (is the model server running?)'
        : (cause?.message ?? (err as Error).message);
    throw new LlmError(`Could not reach ${endpoint.baseUrl}: ${why}`);
  }
}

/** The answer, from a stream of server-sent events or from one JSON body. */
async function read(res: Response, options: ChatOptions): Promise<Completion> {
  const out: Completion = { text: '', toolCalls: [], reasoning: '', finish: null };
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('text/event-stream')) {
    const body = (await res.json()) as ChunkBody;
    if (body.error) throw new LlmError(errorText(body.error), res.status);
    const message = body.choices?.[0]?.message ?? {};
    out.text = typeof message.content === 'string' ? message.content : '';
    if (out.text) options.onText?.(out.text);
    out.reasoning = message.reasoning ?? message.reasoning_content ?? '';
    if (Array.isArray(message.reasoning_details)) out.reasoningDetails = message.reasoning_details;
    out.toolCalls = (message.tool_calls ?? []).map((c, i) => ({
      ...c,
      id: c.id || `call_${i}`,
      type: 'function' as const,
      function: { name: c.function?.name ?? '', arguments: c.function?.arguments ?? '' },
    }));
    out.finish = body.choices?.[0]?.finish_reason ?? null;
    if (body.usage) out.usage = body.usage;
    return out;
  }

  const calls: Partial<LlmToolCall & { function: { name: string; arguments: string } }>[] = [];
  const details: Record<string, unknown>[] = [];
  const reader = res.body?.getReader();
  if (!reader) throw new LlmError('The API sent an empty answer');
  const decoder = new TextDecoder();
  let buffer = '';
  let idle: ReturnType<typeof setTimeout> | undefined;
  let stalled: (err: Error) => void = () => {};
  const stall = new Promise<never>((_, reject) => (stalled = reject));
  stall.catch(() => {});
  /** Every piece that arrives restarts the clock. */
  const arm = () => {
    clearTimeout(idle);
    idle = setTimeout(() => stalled(new LlmError('The model stopped answering')), IDLE_MS);
  };
  arm();
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), stall]);
      if (done) break;
      arm();
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf('\n');
      while (nl !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf('\n');
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let chunk: ChunkBody;
        try {
          chunk = JSON.parse(data) as ChunkBody;
        } catch {
          continue;
        }
        if (chunk.error) throw new LlmError(errorText(chunk.error), res.status);
        if (chunk.usage) out.usage = chunk.usage;
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? choice.message ?? {};
        if (typeof delta.content === 'string' && delta.content) {
          out.text += delta.content;
          options.onText?.(delta.content);
        }
        const thought = delta.reasoning ?? delta.reasoning_content;
        if (typeof thought === 'string' && thought) {
          out.reasoning += thought;
          options.onReasoning?.(thought);
        }
        if (Array.isArray(delta.reasoning_details)) mergeDetails(details, delta.reasoning_details);
        for (const d of delta.tool_calls ?? []) {
          // By index when the API gives one; else a new id is a new call, and a piece without one continues the last.
          const known = d.id ? calls.findIndex((c) => c.id === d.id) : -1;
          // (Some APIs number every call 0, each with its own id: a new id at a taken index is a new call too.)
          const clash = typeof d.index === 'number' && d.id && calls[d.index]?.id && calls[d.index]?.id !== d.id;
          const at =
            typeof d.index === 'number' && !clash
              ? d.index
              : known !== -1
                ? known
                : d.id || !calls.length
                  ? calls.length
                  : calls.length - 1;
          const call = (calls[at] ??= { function: { name: '', arguments: '' } });
          for (const [k, v] of Object.entries(d)) {
            if (k === 'function' || k === 'index' || v === null || v === undefined) continue;
            (call as Record<string, unknown>)[k] = v;
          }
          if (d.function?.name) call.function!.name += d.function.name;
          if (typeof d.function?.arguments === 'string') call.function!.arguments += d.function.arguments;
          else if (d.function?.arguments && typeof d.function.arguments === 'object')
            call.function!.arguments = JSON.stringify(d.function.arguments);
        }
        if (choice.finish_reason) out.finish = choice.finish_reason;
      }
    }
  } finally {
    clearTimeout(idle);
    reader.releaseLock();
  }
  out.toolCalls = calls
    .filter((c) => c?.function?.name)
    .map((c, i) => ({ ...c, id: c.id || `call_${Date.now()}_${i}`, type: 'function' as const, function: c.function! }));
  if (details.length) out.reasoningDetails = details;
  return out;
}

interface ChunkBody {
  error?: unknown;
  usage?: Completion['usage'];
  choices?: {
    finish_reason?: string | null;
    delta?: Delta;
    message?: Delta;
  }[];
}

interface Delta {
  content?: string | null;
  reasoning?: string;
  reasoning_content?: string;
  reasoning_details?: Record<string, unknown>[];
  tool_calls?: (Partial<LlmToolCall> & { index?: number; function?: { name?: string; arguments?: string | object } })[];
}

/** Streamed reasoning details arrive in pieces, by index: text pieces are joined, the rest kept as last sent. */
function mergeDetails(into: Record<string, unknown>[], parts: Record<string, unknown>[]) {
  for (const part of parts) {
    const at = typeof part.index === 'number' ? part.index : into.length;
    const existing = into[at];
    if (!existing) {
      into[at] = { ...part };
      continue;
    }
    for (const [k, v] of Object.entries(part)) {
      if (typeof v === 'string' && typeof existing[k] === 'string' && (k === 'text' || k === 'summary' || k === 'data')) existing[k] += v;
      else if (v !== null && v !== undefined) existing[k] = v;
    }
  }
}

async function errorOf(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  let message = text.trim();
  try {
    const body = JSON.parse(text) as { error?: unknown; message?: unknown; detail?: unknown };
    message = errorText(body.error ?? body.message ?? body.detail ?? text);
  } catch {
    // Not JSON: the text is the message.
  }
  const what =
    res.status === 401 || res.status === 403
      ? 'The API refused the key'
      : res.status === 404
        ? 'The API has no such model or address'
        : res.status === 429
          ? 'The API says too many requests (or out of credit)'
          : `The API answered ${res.status}`;
  return message ? `${what}: ${message.slice(0, 400)}` : what;
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const e = error as { message?: unknown; metadata?: { raw?: unknown } };
    const raw = typeof e.metadata?.raw === 'string' ? ` (${e.metadata.raw.slice(0, 200)})` : '';
    if (typeof e.message === 'string') return e.message + raw;
  }
  return JSON.stringify(error).slice(0, 400);
}

function kindOf(message: string, status?: number): LlmError['kind'] {
  if (status === 401 || status === 403) return 'auth';
  if (/context.{0,20}(length|window|size)|maximum context|too many tokens|prompt is too long|n_ctx|exceeds? the (max|limit)/i.test(message))
    return 'context';
  if (/does not support tools|tool(s| use| calling)? (is |are )?not supported|no endpoints found that support tool/i.test(message))
    return 'tools';
  if (/image|vision|multimodal|image_url/i.test(message) && /support|unsupported|not allowed|invalid/i.test(message)) return 'images';
  return undefined;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
