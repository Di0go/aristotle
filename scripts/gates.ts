// Every check a change must pass, in one command: the same list runs in the pre-push hook, in CI and before
// a release. The checks that don't depend on each other run side by side (docs, lint, types and the build), and
// the tests start as soon as the build they serve is done. Each one's output is held and shown only if it fails;
// the first failure stops the rest.
//
//   pnpm gates            everything
//   pnpm gates --quick    the fast ones only (the pre-commit hook): docs, lint, types

import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const quick = process.argv.includes('--quick');

interface Gate {
  name: string;
  command: string[];
  quick?: boolean;
  /** A gate that must pass first. */
  after?: string;
}

const gates: Gate[] = [
  { name: 'docs are current', command: ['node', 'scripts/docs.ts', '--check'], quick: true },
  { name: 'lint and format', command: ['pnpm', 'run', '--silent', 'lint'], quick: true },
  { name: 'types', command: ['pnpm', 'run', '--silent', 'check'], quick: true },
  { name: 'build', command: ['pnpm', 'run', '--silent', 'build'] },
  { name: 'tests', command: ['pnpm', 'run', '--silent', 'test'], after: 'build' },
];

const running = new Set<ChildProcess>();
const started = performance.now();

/** Runs one gate, resolving when it passes; on a failure, prints its output, stops the others and exits. */
function run(gate: Gate): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const [cmd, ...args] = gate.command;
    const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, FORCE_COLOR: '1' } });
    running.add(child);
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', (code) => {
      running.delete(child);
      const seconds = ((performance.now() - t0) / 1000).toFixed(1);
      if (code !== 0) {
        for (const other of running) other.kill();
        process.stderr.write(`${output}\n✗ ${gate.name} (${seconds}s): ${gate.command.join(' ')}\n`);
        process.exit(1);
      }
      console.error(`✓ ${gate.name} (${seconds}s)`);
      resolve();
    });
  });
}

const chosen = gates.filter((g) => !quick || g.quick);
const done = new Map<string, Promise<void>>();
for (const gate of chosen) {
  const before = gate.after ? done.get(gate.after) : undefined;
  done.set(gate.name, before ? before.then(() => run(gate)) : run(gate));
}
await Promise.all(done.values());
if (!quick) console.error(`All gates passed in ${((performance.now() - started) / 1000).toFixed(1)}s.`);
