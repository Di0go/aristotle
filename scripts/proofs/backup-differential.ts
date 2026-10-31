// server/backup.ts on the reference (main) against this checkout's (the core's Backup, with Aristotle's own words for
// what changed), each on its own copy of the data made into a Git repository with a bare remote: the same changes
// (a topic, two sittings, a roadmap, a mission; then one sitting; then a file of no kind), each backed up, and then
// the commit messages, the trees and what reached the remote compared. Prints hashes and messages' shapes, never
// values: the messages name topics, so they are compared hashed.
//
//   node scripts/proofs/backup-differential.ts [--data <folder>] [--ref <ref>]

import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { compare, copyData, hash, hermeticEnv, reference, refused, refusingProxy, ROOT, sourceData, workDir } from './reference.ts';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();

// One side, in a child of its own: three rounds of changes, each backed up through the module's own timer.
if (process.argv[2] === '--run') {
  const [, , , root = '', data = ''] = process.argv;
  const { Backup } = await import(path.join(root, 'server/backup.ts'));
  const backup = new Backup();
  const settle = async () => {
    const before = backup.state().lastAt;
    backup.schedule(10);
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const s = backup.state();
      if (!s.pending && s.lastAt !== before) break;
    }
    // lastAt is to the second: the next round's commit must be told apart from this one's.
    await new Promise((r) => setTimeout(r, 1100));
  };
  const first = (dir: string) => readdirSync(path.join(data, dir)).filter((f) => f.endsWith('.json') || f.endsWith('.jsonl'))[0];
  const touch = (file: string) => appendFileSync(path.join(data, file), '\n');
  const topic = first('topics');
  const roadmap = first('roadmaps');
  const sessions = readdirSync(path.join(data, 'sessions')).slice(0, 2);
  if (topic) touch(`topics/${topic}`);
  for (const s of sessions) touch(`sessions/${s}`);
  if (roadmap) touch(`roadmaps/${roadmap}`);
  mkdirSync(path.join(data, 'missions'), { recursive: true });
  writeFileSync(path.join(data, 'missions', 'differential-mission.json'), '{}\n');
  await settle();
  if (sessions[0]) touch(`sessions/${sessions[0]}`);
  await settle();
  writeFileSync(path.join(data, 'something-else.txt'), 'x\n');
  await settle();
  const state = backup.state();
  console.log(`enabled ${state.enabled}\nerror ${state.lastError ?? 'none'}`);
  process.exit(0);
}

const { dir, done } = workDir('backup-differential');
const ref = reference(dir);
const proxy = await refusingProxy();
let code = 1;
try {
  const source = sourceData();
  const run = (root: string, side: string) => {
    const data = path.join(dir, side, 'data');
    const remote = path.join(dir, side, 'remote.git');
    copyData(source, data);
    git(dir, 'init', '--quiet', '--bare', remote);
    git(data, 'init', '--quiet', '-b', 'main');
    git(data, 'add', '-A');
    git(data, 'commit', '--quiet', '-m', 'start');
    git(data, 'remote', 'add', 'origin', remote);
    git(data, 'push', '--quiet', '-u', 'origin', 'main');
    const start = git(data, 'rev-parse', 'HEAD');
    const r = spawnSync(process.execPath, [import.meta.filename, '--run', root, data], {
      cwd: ROOT,
      env: hermeticEnv(proxy.url(side), {
        ARISTOTLE_DATA_DIR: data,
        ARISTOTLE_STATE_DIR: path.join(dir, side, 'state'),
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@t',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t',
        // No global or system Git config (a hooks path, signing): the same bare Git on both sides.
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
      }),
      encoding: 'utf8',
    });
    if (r.status !== 0) throw new Error(r.stderr);
    const log = git(data, 'log', '--format=%s', `${start}..HEAD`).split('\n').filter(Boolean).reverse();
    return [
      ...r.stdout.trim().split('\n'),
      `commits ${log.length}`,
      ...log.map((m, i) => `message${i} ${m.replace(/^(Data: ).*/, '$1')}${hash(m)}`),
      `tree ${git(data, 'rev-parse', 'HEAD^{tree}')}`,
      `remote ${git(remote, 'rev-parse', 'main^{tree}')}`,
      `status ${hash(git(data, 'status', '--porcelain'))}`,
    ];
  };
  const same = compare(run(ref.root, 'a'), run(ROOT, 'b'));
  const out = refused(proxy.calls);
  console.log(out.line);
  code = same && !out.lopsided ? 0 : 1;
  console.log(code ? 'DIFFERENT' : 'SAME');
} finally {
  proxy.close();
  ref.remove();
  done();
}
process.exit(code);
