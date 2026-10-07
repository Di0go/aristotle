// Start, stop and check the Aristotle server. Used by the bridge and by `pnpm app <command>`.
// Never writes to stdout: the bridge's stdout is Claude Code's MCP channel.
//
// The live instance goes through systemd when aristotle.service is installed (scripts/install-service.sh).
// That service may run another checkout of the code (the release copy, scripts/release.ts), so `start --build`
// refuses to build here for it. A dev instance (ARISTOTLE_INSTANCE=dev) never touches systemd.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { INSTANCE, PORT, ROOT, STATE_DIR, UI_DIR, URL_CLEAN } from './config.ts';
import { listenerOwner } from './peer.ts';

// One pid file per port, so test servers on other ports never touch the real one's.
export const PID_FILE = path.join(STATE_DIR, `server-${PORT}.pid`);
export const LOG_FILE = path.join(STATE_DIR, 'server.log');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The systemd user service from scripts/install-service.sh, when installed. Only ever the live instance's. */
const SERVICE = 'aristotle.service';
const systemctl = (...args: string[]) => spawnSync('systemctl', ['--user', ...args, SERVICE], { stdio: 'ignore' }).status === 0;
const serviceEnabled = () => INSTANCE === 'live' && systemctl('is-enabled', '--quiet');

/** The checkout the service runs, from its WorkingDirectory. */
function serviceRoot(): string | undefined {
  const out = spawnSync('systemctl', ['--user', 'show', '--property=WorkingDirectory', '--value', SERVICE], { encoding: 'utf8' });
  return out.status === 0 && out.stdout.trim() ? out.stdout.trim() : undefined;
}

/** What the running server says about itself, or null when nothing answers on the port (or someone else does). */
export async function health(): Promise<{ ok: boolean; instance?: string; root?: string; pid?: number } | null> {
  // 127.0.0.1, not localhost: localhost resolves to ::1 first, where another user could be listening.
  // And only a server this user runs: another account listening on the port first is not Aristotle (peer.ts).
  const owner = listenerOwner(PORT);
  if (owner !== undefined && owner !== process.getuid?.()) {
    console.error(`Aristotle: port ${PORT} is held by another user (uid ${owner}); not talking to it.`);
    return null;
  }
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: AbortSignal.timeout(1000) });
    return res.ok ? ((await res.json()) as { ok: boolean; instance?: string; root?: string; pid?: number }) : null;
  } catch {
    return null;
  }
}

const isRunning = async () => Boolean(await health());

/** Builds the interface into dist/ui of this checkout. */
export function build(stdio: 'inherit' | number = 'inherit') {
  return (
    spawnSync(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build'], {
      cwd: ROOT,
      stdio: ['ignore', stdio, stdio],
    }).status === 0
  );
}

/** Starts the server (through systemd when the service is installed) and waits up to 5 seconds for it to answer. */
export async function start(): Promise<boolean> {
  if (await isRunning()) return true;
  mkdirSync(STATE_DIR, { recursive: true });
  const log = openSync(LOG_FILE, 'a');
  if (serviceEnabled()) systemctl('start');
  else {
    if (!existsSync(path.join(UI_DIR, 'index.html'))) build(log);
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

/** Stops the server, through systemd or by the pid it wrote, and waits for it to go quiet. */
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
  // A pid file left by a crash may name some other process by now: only ever signal an Aristotle server.
  if (!isServer(pid)) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  for (let i = 0; i < 50 && (await isRunning()); i++) await sleep(100);
}

/** Whether `pid` is an Aristotle server (its command line runs server/index.ts); true where that can't be read. */
function isServer(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('server/index.ts');
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ENOENT';
  }
}

if (import.meta.main) {
  const [command = 'status', flag] = process.argv.slice(2);
  const say = (m: string) => console.error(m);
  const where = `${URL_CLEAN} (http://127.0.0.1:${PORT})`;
  const runs = serviceEnabled() ? serviceRoot() : undefined;

  if (command === 'start' || command === 'restart') {
    if (flag === '--build') {
      // Building here only changes what runs when this checkout is the one being served.
      if (runs && path.resolve(runs) !== ROOT) {
        say(`The live app runs the release copy in ${runs}, not this checkout.`);
        say('To ship what is committed here: pnpm release. To try changes first: pnpm dev.');
        process.exit(1);
      }
      if (!build()) process.exit(1);
    }
    if (command === 'restart') await stop();
    say((await start()) ? `Running at ${where}` : `Failed to start; see ${LOG_FILE}`);
  } else if (command === 'stop') {
    await stop();
    say('Stopped');
  } else {
    const h = await health();
    if (!h) say('Not running');
    else say(`Running at ${where}: ${h.instance ?? 'live'} instance, code in ${h.root ?? '?'}${runs ? ' (systemd)' : ''}`);
  }
}
