// Claude Code's Stop hook (.claude/settings.json): before Claude finishes a turn in which it changed code, the
// generated docs are rewritten, and if a changed zone's prose docs were not touched, Claude is sent back to
// update them (or to say why nothing needs to change). So nobody has to ask for "update the docs".
// Only files changed since this session started count, so a teaching session never trips it.

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { undocumented } from './doc-zones.ts';
import { generate } from './docs.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const input = JSON.parse(readFileSync(0, 'utf8') || '{}') as { stop_hook_active?: boolean; transcript_path?: string };
// Already sent back once this turn: let it stop, rather than loop.
if (input.stop_hook_active) process.exit(0);

function sessionStart(): number {
  try {
    const first = readFileSync(input.transcript_path ?? '', 'utf8').split('\n', 1)[0];
    const at = Date.parse((JSON.parse(first) as { timestamp?: string }).timestamp ?? '');
    if (at) return at;
  } catch {}
  return Date.now() - 3 * 3600_000;
}

const git = (...args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const since = sessionStart();
const pending = git('status', '--porcelain', '--untracked-files=all')
  .split('\n')
  .filter(Boolean)
  .map((l) => l.slice(3).replace(/^.* -> /, ''))
  .filter((f) => {
    try {
      return statSync(path.join(ROOT, f)).mtimeMs >= since;
    } catch {
      return true; // deleted
    }
  });
const committed = git('log', `--since=${new Date(since).toISOString()}`, '--name-only', '--format=')
  .split('\n')
  .filter(Boolean);
const changed = [...new Set([...pending, ...committed])];
if (!changed.some((f) => !f.endsWith('.md'))) process.exit(0);

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
