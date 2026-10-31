// One question, answered in a few seconds and forgotten: the core's (@organon/core/server/oneshot), by Claude Code
// (`claude -p` on the learner's own login, headless and locked down: no tools, no MCP servers, no settings or hooks,
// no saved session, run from a private folder outside any project), or by the model API when Settings say so, asked
// as Aristotle. Glosses and questions on a passage use it; the chat (chat.ts) runs the same locked-down command or API.
// At most a few run at once, however many are asked for.

import { createOneshot } from '@organon/core/server/oneshot';
import { app } from './config.ts';
import { IDENTITY } from './llm.ts';
import { settings } from './settings.ts';

export { claudeEnv, OneshotError } from '@organon/core/server/oneshot';

export const helper = createOneshot({ app, settings, identity: IDENTITY });

/** The answer to `request`, under the instructions in `system`: from the model API, or from Claude Code. */
export const oneshot = (system: string, request: string) => helper.ask(system, request);
/** Whether glosses and the chat go to the model API (Settings) rather than Claude Code (or a test's stand-in for it). */
export const useApi = () => helper.useApi();
export const headlessArgs = (system: string, extra: string[] = []) => helper.headlessArgs(system, extra);
export const claudeCwd = () => helper.cwd();
export const limited = <T>(job: () => Promise<T>) => helper.limited(job);
