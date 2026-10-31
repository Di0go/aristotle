// Every check a change must pass, in one command: the core's runGates (@organon/core/server/gates) with Aristotle's
// gates. The same list runs in the pre-commit hook (the quick ones), the pre-push hook, CI and before a release; the
// independent ones side by side, the tests as soon as the build they serve is done, the first failure stopping the rest.
//
//   pnpm gates            everything
//   pnpm gates --quick    the fast ones only (the pre-commit hook): docs, lint, types

import path from 'node:path';
import { runGates } from '@organon/core/server/gates';

await runGates(path.resolve(import.meta.dirname, '..'), [
  { name: 'docs are current', command: ['node', 'scripts/docs.ts', '--check'], quick: true },
  { name: 'lint and format', command: ['pnpm', 'run', '--silent', 'lint'], quick: true },
  { name: 'types', command: ['pnpm', 'run', '--silent', 'check'], quick: true },
  { name: 'build', command: ['pnpm', 'run', '--silent', 'build'] },
  { name: 'tests', command: ['pnpm', 'run', '--silent', 'test'], after: 'build' },
]);
