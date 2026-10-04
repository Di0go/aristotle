// Start, stop and check the Mind Gym server. Used by the bridge and by `pnpm gym <command>`.
// Never writes to stdout: the bridge's stdout is Claude Code's MCP channel.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PORT, ROOT, UI_DIR, URL_CLEAN } from './config.ts';

const STATE_DIR = path.join(ROOT, '.gym');
// One pid file per port, so test servers on other ports never touch the real one's.
export const PID_FILE = path.join(STATE_DIR, `server-${PORT}.pid`);
export const LOG_FILE = path.join(STATE_DIR, 'server.log');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The systemd user service from scripts/install-service.sh, when installed. */
const SERVICE = 'mind-gym.service';
const systemctl = (...args: string[]) => spawnSync('systemctl', ['--user', ...args, SERVICE], { stdio: 'ignore' }).status === 0;
export const serviceEnabled = () => systemctl('is-enabled', '--quiet');

export async function isRunning(): Promise<boolean> {
  try {
    return (await fetch(`http://localhost:${PORT}/api/health`, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

export async function start(): Promise<boolean> {
  if (await isRunning()) return true;
  mkdirSync(STATE_DIR, { recursive: true });
  const log = openSync(LOG_FILE, 'a');
  if (!existsSync(path.join(UI_DIR, 'index.html'))) {
    spawnSync(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build'], {
      cwd: ROOT,
      stdio: ['ignore', log, log],
    });
  }
  if (serviceEnabled()) systemctl('start');
  else {
    spawn(process.execPath, [path.join(ROOT, 'server/index.ts')], {
      cwd: ROOT,
      detached: true,
      stdio: ['ignore', log, log],
    }).unref();
  }
  for (let i = 0; i < 50; i++) {
    if (await isRunning()) return true;
    await sleep(100);
  }
  return false;
}

export async function stop(): Promise<void> {
  if (serviceEnabled()) {
    systemctl('stop');
    return;
  }
  let pid: number;
  try {
    pid = Number(readFileSync(PID_FILE, 'utf8'));
  } catch {
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  for (let i = 0; i < 50 && (await isRunning()); i++) await sleep(100);
}

if (import.meta.main) {
  const command = process.argv[2] ?? 'status';
  const say = (m: string) => console.error(m);
  if (command === 'start') say((await start()) ? `Running at ${URL_CLEAN} (http://localhost:${PORT})` : `Failed to start; see ${LOG_FILE}`);
  else if (command === 'stop') {
    await stop();
    say('Stopped');
  } else if (command === 'restart') {
    await stop();
    say((await start()) ? `Restarted at ${URL_CLEAN} (http://localhost:${PORT})` : `Failed to start; see ${LOG_FILE}`);
  } else say((await isRunning()) ? `Running at ${URL_CLEAN} (http://localhost:${PORT})` : 'Not running');
}
