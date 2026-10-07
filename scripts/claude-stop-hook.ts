// Claude Code's Stop hook (.claude/settings.json): before Claude finishes a turn in which it changed code, the
// generated docs are rewritten, and if a changed zone's prose docs were not touched, Claude is sent back to
// update them (or to say why nothing needs to change). So nobody has to ask for "update the docs".
// Only files changed since this session started count, and never in Aristotle's drawer (a lesson, not development).

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { NO_DOCS, undocumented } from './doc-zones.ts';
import { generate } from './docs.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

// The tutor in Aristotle's terminal drawer (server/terminal.ts sets this): a lesson, where commits released meanwhile
// must never send it off to write docs.
if (process.env.ARISTOTLE_DRAWER) process.exit(0);
const input = JSON.parse(readFileSync(0, 'utf8') || '{}') as { stop_hook_active?: boolean; transcript_path?: string };
// Already sent back once this turn: let it stop, rather than loop.
if (input.stop_hook_active) process.exit(0);

// 1. What this session changed: files touched since it started, and what it committed since.
const since = sessionStart();
const pending = porcelain(git('status', '--porcelain', '-z', '--untracked-files=all')).filter((f) => {
  try {
    return statSync(path.join(ROOT, f)).mtimeMs >= since;
  } catch {
    return true; // deleted
  }
});
// Files of the commits made since, except those whose message says why no docs changed ("Docs: none -- <why>").
const committed = git('log', `--since=${new Date(since).toISOString()}`, '--name-only', '--format=%x00%B%x01')
  .split('\0')
  .filter(Boolean)
  .flatMap((entry) => {
    const [message, files = ''] = entry.split('\x01');
    return NO_DOCS.test(message) ? [] : files.split('\n').filter(Boolean);
  });
const changed = [...new Set([...pending, ...committed])];
// Only Markdown changed (or nothing): no code to keep the docs in step with.
if (!changed.some((f) => !f.endsWith('.md'))) process.exit(0);

// 2. Rewrite the generated docs, then send Claude back if a zone's prose was left behind.
const regenerated = await generate(true).catch(() => []);
const missing = undocumented(changed);
if (missing.length) {
  const reason = [
    'Before finishing: this session changed code whose docs did not change.',
    ...missing.map(
      (m) => `- ${m.name}: ${m.files.slice(0, 6).join(', ')}${m.files.length > 6 ? ', …' : ''}. Docs: ${m.docs.join(' or ')}.`,
    ),
    'Update the prose in one of them so it still describes the code (docs/README.md says which doc covers what).',
    'If nothing there is affected, say so in one line and, when you commit, add "Docs: none -- <why>" to the message.',
  ];
  console.log(JSON.stringify({ decision: 'block', reason: reason.join('\n') }));
} else if (regenerated.length) {
  console.error(`Generated docs updated: ${regenerated.join(', ')}`);
}
process.exit(0);

/**
 * When this session started: the first entry of its transcript that carries a time (the first lines may not: a mode
 * line, a file-history snapshot), or three hours ago if none can be read.
 */
function sessionStart(): number {
  try {
    for (const line of readFileSync(input.transcript_path ?? '', 'utf8').split('\n', 50)) {
      if (!line.trim()) continue;
      try {
        const at = Date.parse((JSON.parse(line) as { timestamp?: string }).timestamp ?? '');
        if (at) return at;
      } catch {}
    }
  } catch {}
  return Date.now() - 3 * 3600_000;
}

/** The paths in `git status --porcelain -z`, exactly as Git has them. A rename or copy counts under its new name. */
function porcelain(out: string): string[] {
  const entries = out.split('\0');
  const paths: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    paths.push(entry.slice(3));
    // Renames and copies carry their source path as the next entry.
    if (entry[0] === 'R' || entry[0] === 'C' || entry[1] === 'R' || entry[1] === 'C') i++;
  }
  return paths;
}
