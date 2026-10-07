// The backup (server/backup.ts) against a throwaway data repository: it commits what changed with a message naming
// it, pushes when there is a remote, and when that keeps failing the interface is told (warnings.ts).
// A file of its own: the data folder is read from the environment when the server's modules load.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(tmpdir(), 'aristotle-backup-'));
const data = path.join(root, 'data');
const remote = path.join(root, 'remote.git');
process.env.ARISTOTLE_DATA_DIR = data;
process.env.ARISTOTLE_STATE_DIR = path.join(root, 'state');
delete process.env.ARISTOTLE_INSTANCE;
delete process.env.ARISTOTLE_BACKUP;

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('the backup commits what changed, pushes it, and says so in the interface when it fails', async (t) => {
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(data, 'topics'), { recursive: true });
  git(root, 'init', '--quiet', '--bare', remote);
  git(data, 'init', '--quiet');
  git(data, 'config', 'user.email', 'test@example.com');
  git(data, 'config', 'user.name', 'Test');
  git(data, 'commit', '--quiet', '--allow-empty', '-m', 'start');
  git(data, 'remote', 'add', 'origin', remote);
  git(data, 'push', '--quiet', '-u', 'origin', 'HEAD');

  const { Backup } = await import('../server/backup.ts');
  const { warnings } = await import('../server/warnings.ts');
  const backup = new Backup();
  assert.equal(backup.enabled, true);

  await writeFile(path.join(data, 'topics', 'the-heart.json'), '{}');
  backup.schedule(0);
  for (let i = 0; i < 100 && !backup.state().lastAt; i++) await sleep(50);
  assert.match(git(data, 'log', '-1', '--format=%s'), /^Data: the-heart$/);
  assert.equal(git(data, 'rev-parse', 'HEAD'), git(remote, 'rev-parse', 'HEAD'), 'pushed');
  assert.deepEqual(warnings.list(), []);

  // The remote goes away: the commit still happens, the push fails, and the learner is told.
  await rm(remote, { recursive: true, force: true });
  await writeFile(path.join(data, 'topics', 'the-heart.json'), '{"changed":true}');
  backup.schedule(0);
  for (let i = 0; i < 100 && !backup.state().lastError; i++) await sleep(50);
  assert.ok(
    warnings.list().some((w) => /^Backup has failed since /.test(w)),
    warnings.list().join('; '),
  );
});
