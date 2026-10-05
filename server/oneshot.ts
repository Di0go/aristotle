// One question to Claude Code, answered in a few seconds and forgotten: `claude -p` on his own login, headless and
// locked down (no tools, no MCP servers, no settings or hooks, no saved session, run from a neutral folder). Glosses
// and his questions on a passage use it. The request goes on stdin; whatever it prints is the answer.

import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { ONESHOT_CMD, ONESHOT_MODEL } from './config.ts';

/** Claude Code usually answers in five to fifteen seconds; past this, something is wrong. */
const TIMEOUT_MS = 90_000;

export class OneshotError extends Error {}

/** Claude Code's answer to `request`, under the instructions in `system`. */
export function oneshot(system: string, request: string): Promise<string> {
  const args = ONESHOT_CMD
    ? ONESHOT_CMD.split(' ')
    : [
        'claude',
        '-p',
        '--model',
        ONESHOT_MODEL,
        '--tools',
        '',
        '--strict-mcp-config',
        '--setting-sources',
        '',
        '--no-session-persistence',
        '--system-prompt',
        system,
      ];
  const [file, ...rest] = args;
  return new Promise((resolve, reject) => {
    const child = spawn(file, rest, { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'], timeout: TIMEOUT_MS, env: claudeEnv() });
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
    child.stdin.end(request);
  });
}

/** The environment Claude Code runs in: a service started at login may not have his PATH, and it lives in ~/.local/bin. */
export function claudeEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: [path.join(os.homedir(), '.local/bin'), process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin'].join(':') };
}
