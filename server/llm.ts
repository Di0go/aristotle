// Talking to a model behind an OpenAI-compatible API: the core's (@organon/core/server/llm): Chat Completions,
// streamed, with tools, spoken by OpenRouter, Ollama, LM Studio, llama.cpp's server, vLLM and most others, so any
// model, hosted or local, can teach (tutor-api.ts) and write glosses, answers on a passage (oneshot.ts) and the chat
// (chat.ts); OpenAI's own API through its Responses API. Aristotle says who calls (IDENTITY), as before.

import {
  type ChatOptions,
  type Completion,
  chat as coreChat,
  complete as coreComplete,
  type Endpoint,
  type LlmIdentity,
  listModels as coreListModels,
} from '@organon/core/server/llm';
import type { ModelInfo } from '@organon/core/shared/agents';

export {
  type ChatOptions,
  type Completion,
  type Endpoint,
  LlmError,
  type LlmMessage,
  type LlmPart,
  type LlmTool,
  type LlmToolCall,
  stripThinking,
} from '@organon/core/server/llm';

/** Who calls, as OpenRouter lists the apps that say so (its X-Title and HTTP-Referer). */
export const IDENTITY: LlmIdentity = { title: 'Aristotle', site: 'https://github.com/Di0go/aristotle' };

/** The models the API offers, asked as Aristotle. */
export function listModels(endpoint: Parameters<typeof coreListModels>[0], signal?: AbortSignal): Promise<ModelInfo[]> {
  return coreListModels(endpoint, signal, IDENTITY);
}

/** A turn of the conversation, asked as Aristotle. */
export function chat(endpoint: Endpoint, options: ChatOptions): Promise<Completion> {
  return coreChat(endpoint, { identity: IDENTITY, ...options });
}

/** One answer to one prompt, asked as Aristotle. */
export function complete(...[endpoint, system, user, options = {}]: Parameters<typeof coreComplete>): ReturnType<typeof coreComplete> {
  return coreComplete(endpoint, system, user, { identity: IDENTITY, ...options });
}
