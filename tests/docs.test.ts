// The docs stay true: every doc is in the index, every link resolves, every command and setting is
// documented, and code that changed since the last release came with a change to the docs that describe it.
//
//   pnpm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { undocumented, NO_DOCS } from '../scripts/doc-zones.ts';
import { header, mappedFiles } from '../scripts/docs.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const docs = readdirSync(path.join(ROOT, 'docs'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => `docs/${f}`);

const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

/** Runs git in the repository; null when it fails (no such tag, not a repository). */
const git = (...args: string[]) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

test('every doc is listed in docs/README.md', () => {
  const index = read('docs/README.md');
  for (const doc of docs.filter((d) => d !== 'docs/README.md')) {
    assert.ok(index.includes(`(${path.basename(doc)})`), `${doc} is not linked from docs/README.md`);
  }
});

test('every relative link in the docs points at something that exists', () => {
  for (const doc of [...docs, 'README.md', 'CONTRIBUTING.md', 'CLAUDE.md']) {
    const text = read(doc).replace(/```[\s\S]*?```/g, '');
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const file = path.resolve(ROOT, path.dirname(doc), decodeURIComponent(target.split('#')[0]));
      assert.ok(existsSync(file), `${doc} links to ${target}, which does not exist`);
    }
  }
});

test('every pnpm script is explained in docs/development.md', () => {
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  const prose = read('docs/development.md').replace(/<!-- generated: scripts -->[\s\S]*?<!-- \/generated -->/, '');
  for (const name of Object.keys(pkg.scripts).filter((n) => n !== 'prepare')) {
    assert.ok(prose.includes(`pnpm ${name}`), `pnpm ${name} is not explained in docs/development.md (outside the generated table)`);
  }
});

test('every source file says what it is for in its first lines', () => {
  for (const f of mappedFiles()) assert.ok(header(f), `${f} has no header comment`);
});

test('code changed since the last release came with its docs', (t) => {
  // The release tag marks what is live; without it (a fresh clone, CI without tags) there is nothing to compare.
  const base = git('rev-parse', '--verify', '--quiet', 'refs/tags/live');
  if (!base) return t.skip('no live tag');
  const changed = git('diff', '--name-only', `${base}..HEAD`)?.split('\n').filter(Boolean) ?? [];
  const messages = git('log', '--format=%B', `${base}..HEAD`) ?? '';
  if (NO_DOCS.test(messages)) return;
  const missing = undocumented(changed);
  assert.deepEqual(
    missing.map((m) => m.name),
    [],
    missing
      .map((m) => `${m.name}: ${m.files.join(', ')} changed, but none of ${m.docs.join(', ')} did.`)
      .concat('Update one of them, or say why not in a commit message: "Docs: none -- <why>".')
      .join('\n'),
  );
});
