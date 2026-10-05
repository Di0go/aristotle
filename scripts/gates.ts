// Every check a change must pass, in one command: the same list runs in the pre-push hook, in CI and before
// a release. Cheapest first, so a failure shows up fast; the build comes before the tests, which serve its pages.
//
//   pnpm gates            everything
//   pnpm gates --quick    the fast ones only (the pre-commit hook): docs, lint, types

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const quick = process.argv.includes('--quick');

const gates: { name: string; command: string[]; quick?: boolean }[] = [
  { name: 'docs are current', command: ['node', 'scripts/docs.ts', '--check'], quick: true },
  { name: 'lint and format', command: ['pnpm', 'exec', 'biome', 'check', '.'], quick: true },
  { name: 'types', command: ['pnpm', 'run', '--silent', 'check'], quick: true },
  { name: 'build', command: ['pnpm', 'run', '--silent', 'build'] },
  { name: 'tests', command: ['pnpm', 'run', '--silent', 'test'] },
];

for (const gate of gates.filter((g) => !quick || g.quick)) {
  const started = performance.now();
  const [cmd, ...args] = gate.command;
  const run = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '1' } });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  if (run.status !== 0) {
    process.stderr.write(`${run.stdout}${run.stderr}\n✗ ${gate.name} (${seconds}s): ${gate.command.join(' ')}\n`);
    process.exit(1);
  }
  console.error(`✓ ${gate.name} (${seconds}s)`);
}
