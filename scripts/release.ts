// Ships what is committed here to the app you learn in, without ever running half-finished code.
//
// The live app runs from a release copy (a Git worktree, ~/.local/share/aristotle/app by default) checked out
// at a fixed commit, while its data and state stay in this checkout's data/ and .aristotle/. A release:
//   1. refuses uncommitted changes, then runs every gate (scripts/gates.ts);
//   2. checks the commit out in the release copy, installs and builds there;
//   3. points aristotle.service at it (scripts/install-service.sh) and restarts it;
//   4. checks it answers from the new copy; if not, puts the previous release back.
// The tag `live` marks what is running; `git log live..` is what is not released yet.
//
//   pnpm release              release HEAD
//   pnpm release --rollback   go back to the release before (tag live-previous), without gates

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
/** Where the release copy lives: a Git worktree of this repository that the live service runs. */
const RELEASE_DIR = path.resolve(process.env.ARISTOTLE_RELEASE_DIR ?? path.join(os.homedir(), '.local/share/aristotle/app'));
const LIVE_PORT = 4747;

// 1. Refuse uncommitted changes and run the gates (not for a rollback, which goes back to a release that passed).
const rollback = process.argv.includes('--rollback');
const previous = tag('live');
const target = rollback ? tag('live-previous') : git('rev-parse', 'HEAD');
if (!target) throw new Error('Nothing to roll back to: there is no live-previous tag yet.');

if (!rollback) {
  if (git('status', '--porcelain', '--untracked-files=no')) {
    say('Uncommitted changes: commit them first. A release is always a commit you can go back to.');
    process.exit(1);
  }
  if (target === previous) say(`${target.slice(0, 7)} is already live; rebuilding it.`);
  run('pnpm', ['gates'], ROOT);
}

// 2 to 4. Deploy it; move the tags if it came up, put the previous release back if it did not.
say(`Releasing ${git('log', '-1', '--format=%h %s', target)} to ${RELEASE_DIR}`);
if (await deploy(target)) {
  if (previous && previous !== target) git('tag', '-f', 'live-previous', previous);
  git('tag', '-f', 'live', target);
  say(`Live: ${target.slice(0, 7)}. Rollback: pnpm release --rollback`);
} else {
  say('The new release did not come up.');
  if (previous && previous !== target) {
    say(`Putting ${previous.slice(0, 7)} back.`);
    say(
      (await deploy(previous)) ? 'Previous release restored.' : 'The previous release did not come up either: see .aristotle/server.log.',
    );
  }
  process.exit(1);
}

function say(m: string) {
  console.error(m);
}

function git(...args: string[]) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

/** The commit a tag points at, or undefined if there is no such tag. */
function tag(name: string) {
  try {
    return git('rev-parse', '--verify', '--quiet', `refs/tags/${name}^{commit}`);
  } catch {
    return undefined;
  }
}

/** Runs a command with its output on this terminal, and throws if it fails. */
function run(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', env });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed in ${cwd}`);
}

/** Whether `p` is a symbolic link, even a broken one (which existsSync reports as missing). */
function isLink(p: string) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/** The checkout the live server says it runs from, once it answers (up to 10 s). */
async function liveRoot(): Promise<string | undefined> {
  for (let i = 0; i < 50; i++) {
    try {
      const h = (await (await fetch(`http://localhost:${LIVE_PORT}/api/health`)).json()) as { root?: string };
      if (h.root) return h.root;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  return undefined;
}

/** Checks `sha` out in the release copy, builds it and restarts the service on it. */
async function deploy(sha: string): Promise<boolean> {
  if (!existsSync(RELEASE_DIR)) run('git', ['worktree', 'add', '--detach', RELEASE_DIR, sha], ROOT);
  else run('git', ['checkout', '--quiet', '--detach', sha], RELEASE_DIR);
  // An agent in the terminal drawer runs in the release copy and may read data/ there (a mission's files, an old
  // skill's data/profile.md): give it the real data/ under the same name.
  const dataLink = path.join(RELEASE_DIR, 'data');
  if (!existsSync(dataLink) && !isLink(dataLink)) symlinkSync(process.env.ARISTOTLE_DATA_DIR ?? path.join(ROOT, 'data'), dataLink);
  run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline', '--silent'], RELEASE_DIR);
  run('pnpm', ['run', '--silent', 'build'], RELEASE_DIR);
  run('bash', [path.join(RELEASE_DIR, 'scripts/install-service.sh')], RELEASE_DIR, {
    ...process.env,
    ARISTOTLE_DATA_DIR: process.env.ARISTOTLE_DATA_DIR ?? path.join(ROOT, 'data'),
    ARISTOTLE_STATE_DIR: process.env.ARISTOTLE_STATE_DIR ?? path.join(ROOT, '.aristotle'),
  });
  return (await liveRoot()) === RELEASE_DIR;
}
