// The tooling on the reference (main) against this commit's (the core's runGates and runStopHook, with Aristotle's
// gates and doc zones): two throwaway worktrees, each given the same changes, then the Stop hook run in each with the
// same input (a transcript that started just before the changes), and `pnpm gates --quick` run in each. What the hook says, its exit
// code, the files it rewrote, and the gates' names and verdicts must be the same.
//
//   node scripts/proofs/tooling-differential.ts [--ref <ref>]

import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { compare, hash, hermeticEnv, reference, refused, refusingProxy, ROOT, workDir } from './reference.ts';

const { dir, done } = workDir('tooling-differential');
const ref = reference(dir, true);
const proxy = await refusingProxy();
const here = path.join(dir, 'here');
execFileSync('git', ['worktree', 'add', '--quiet', '--detach', here, 'HEAD'], { cwd: ROOT });
let code = 1;
try {
  if (spawnSync('pnpm', ['install', '--frozen-lockfile', '--prefer-offline', '--silent'], { cwd: here, stdio: 'ignore' }).status !== 0)
    throw new Error('pnpm install failed in the worktree of HEAD');
  const transcript = path.join(dir, 'transcript.jsonl');
  // The session starts now: only the changes made below count, not the commits either branch made before.
  writeFileSync(transcript, `${JSON.stringify({ timestamp: new Date(Date.now() - 1000).toISOString() })}\n`);
  const run = (root: string, side: string) => {
    const env = hermeticEnv(proxy.url(side));
    const hook = (drawer: boolean) => {
      const r = spawnSync(process.execPath, ['scripts/claude-stop-hook.ts'], {
        cwd: root,
        env: drawer ? { ...env, ARISTOTLE_DRAWER: '1' } : env,
        input: JSON.stringify({ transcript_path: transcript }),
        encoding: 'utf8',
      });
      const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
      return `exit ${r.status} out ${hash(r.stdout.trim())} err ${hash(r.stderr.trim())} status ${hash(status)}`;
    };
    const out: string[] = [];
    out.push(`clean ${hook(false)}`);
    // Code changed without its docs: sent back to update them (the server's zone, and the interface's).
    appendFileSync(path.join(root, 'server/peer.ts'), '// a change\n');
    appendFileSync(path.join(root, 'ui/src/lib/visible.ts'), '// a change\n');
    out.push(`undocumented ${hook(false)}`, `in the drawer ${hook(true)}`);
    // With a doc of each zone touched too: let through.
    appendFileSync(path.join(root, 'docs/architecture.md'), '\n');
    out.push(`documented ${hook(false)}`);
    execFileSync('git', ['checkout', '--quiet', '--', '.'], { cwd: root });
    const gates = spawnSync('pnpm', ['gates', '--quick'], { cwd: root, env, encoding: 'utf8' });
    const names = `${gates.stdout}${gates.stderr}`
      .split('\n')
      .filter((l) => /^[✓✗] /.test(l))
      .map((l) => l.replace(/ \([\d.]+s\)/, ''))
      .sort();
    out.push(`gates exit ${gates.status}`, ...names.map((n, i) => `gate${i} ${n}`));
    return out;
  };
  const same = compare(run(ref.root, 'a'), run(here, 'b'));
  const out = refused(proxy.calls);
  console.log(out.line);
  code = same && !out.lopsided ? 0 : 1;
  console.log(code ? 'DIFFERENT' : 'SAME');
} finally {
  spawnSync('git', ['worktree', 'remove', '--force', here], { cwd: ROOT });
  proxy.close();
  ref.remove();
  done();
}
process.exit(code);
