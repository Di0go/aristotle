// One question to Claude Code, answered in a few seconds and forgotten: `claude -p` on his own login, headless and
// locked down (no tools, no MCP servers, no settings or hooks, no saved session, run from a private folder outside any
// project). Glosses and his questions on a passage use it; the chat (chat.ts) runs the same locked-down command.
// The request goes on stdin; whatever it prints is the answer. At most a few run at once, however many are asked for.

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CLAUDE_CWD, ONESHOT_CMD, ONESHOT_MODEL } from './config.ts';

/** Claude Code usually answers in five to fifteen seconds; past this, something is wrong. */
const TIMEOUT_MS = 90_000;
/** How many headless Claude Codes may run at once (glosses, questions and chat answers together). */
const MAX_RUNNING = 3;

export class OneshotError extends Error {}

/** Claude Code's answer to `request`, under the instructions in `system`. */
export function oneshot(system: string, request: string): Promise<string> {
  const [file = 'claude', ...rest] = ONESHOT_CMD
    ? ONESHOT_CMD.split(' ')
    : ['claude', ...headlessArgs(system, ['--no-session-persistence'])];
  return limited(async () => {
    const cwd = await claudeCwd();
    return new Promise<string>((resolve, reject) => {
      const child = spawn(file, rest, { cwd, stdio: ['pipe', 'pipe', 'pipe'], timeout: TIMEOUT_MS, env: claudeEnv() });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      child.on('error', (e) => reject(new OneshotError(`Could not start Claude Code: ${e.message}`)));
      child.on('close', (code, signal) => {
        const text = out.trim();
        if (code === 0 && text) return resolve(text);
        if (signal) return reject(new OneshotError('Claude Code took too long to answer'));
        reject(new OneshotError(`Claude Code could not answer${err.trim() ? `: ${err.trim().split('\n').at(-1)}` : ''}`));
      });
      // A child that exits before reading all of a long request must not take the server down with EPIPE.
      child.stdin.on('error', () => {});
      child.stdin.end(request);
    });
  });
}

/** `claude -p` locked down: the model, no tools, no MCP servers, no settings or hooks, then `extra`, then the instructions. */
export function headlessArgs(system: string, extra: string[] = []): string[] {
  return [
    '-p',
    '--model',
    ONESHOT_MODEL,
    '--tools',
    '',
    '--strict-mcp-config',
    '--setting-sources',
    '',
    ...extra,
    '--system-prompt',
    system,
  ];
}

/** The environment Claude Code runs in: a service started at login may not have his PATH, and it lives in ~/.local/bin. */
export function claudeEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: [path.join(os.homedir(), '.local/bin'), process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin'].join(':') };
}

/** The private folder headless Claude Codes run in (config.ts CLAUDE_CWD), made on first use. */
export async function claudeCwd(): Promise<string> {
  await mkdir(CLAUDE_CWD, { recursive: true, mode: 0o700 });
  return CLAUDE_CWD;
}

let running = 0;
const waiting: (() => void)[] = [];

/** Runs `job` once fewer than MAX_RUNNING are running, in the order they were asked for. */
export async function limited<T>(job: () => Promise<T>): Promise<T> {
  if (running >= MAX_RUNNING) await new Promise<void>((go) => waiting.push(go));
  else running++;
  try {
    return await job();
  } finally {
    // The slot passes straight to the next in line, so nobody can slip in between.
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}
