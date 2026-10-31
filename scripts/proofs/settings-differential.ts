// server/settings.ts on the reference (main) against this checkout's (the core's createSettings; Aristotle keeps no
// key of its own), each on its own copy (600, private temp folder) of a settings.json: the same view before and after
// the same changes, the same file, the same endpoints, then back to the defaults; and a settings.json that can't be
// parsed. Organon's scripts/proofs/settings-differential.ts and Galen's are the model. Prints hashes, never values.
//
//   node scripts/proofs/settings-differential.ts [--settings <file>] [--ref <ref>]
//
// Starts from each of: this install's settings.json (.aristotle/settings.json, or --settings; none on this machine
// today, which is the defaults), one with every key set (the accent, a command of his own, an API with a key), and
// one with a stray comma.

import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { compare, hash, hermeticEnv, option, reference, refused, refusingProxy, ROOT, workDir } from './reference.ts';

if (process.argv[2] === '--run') {
  const [, , , root = '', file = ''] = process.argv;
  const { settings: s } = await import(path.join(root, 'server/settings.ts'));
  // The accent as the server uses it: config.ts's ACCENT (main read settings.json a second time for it).
  // (since 3/n there is no ACCENT: the server takes settings.accent, as config-differential.ts compares it).
  const config = await import(path.join(root, 'server/config.ts'));
  const ACCENT = 'ACCENT' in config ? config.ACCENT : s.accent;
  const installed = (id: string) => id === 'claude-code';
  const read = () => (existsSync(file) ? hash(readFileSync(file, 'utf8')) : 'none');
  const out = [`view0 ${hash(s.view(installed))}`, `accent0 ${ACCENT ?? 'none'}`, `command0 ${hash(s.agentCommand ?? null)}`];
  await s.update({ tutor: 'codex' });
  await s.update({ helpers: 'api', api: { provider: 'ollama', model: 'qwen3:8b' } });
  await s.update({ api: { apiKey: 'sk-test-0123456789', baseUrl: 'http://localhost:11434/v1/' } });
  out.push(`view1 ${hash(s.view(installed))}`, `file1 ${read()}`, `endpoint ${hash(s.endpoint())}`);
  out.push(`helper ${hash(s.helperEndpoint())}`, `local ${s.isLocal()}`, `problem ${hash(s.apiProblem() ?? null)}`);
  s.rememberModels([{ id: 'qwen3:8b', contextLength: 32768 }]);
  out.push(`context ${s.knownContext('qwen3:8b') ?? 'none'}`);
  await s.update({ tutor: 'claude-code', helpers: 'claude-code', api: { apiKey: '' } });
  out.push(
    `view2 ${hash(s.view(installed))}`,
    `file2 ${read()}`,
    `mode ${existsSync(file) ? (statSync(file).mode & 0o777).toString(8) : 'none'}`,
  );
  try {
    await s.update({ tutor: 'nope' });
    out.push('bad accepted');
  } catch (e) {
    out.push(`bad refused ${(e as Error).constructor.name}`);
  }
  // Three changes at once.
  const all = await Promise.all([
    s.update({ tutor: 'gemini' }),
    s.update({ helpers: 'claude-code' }),
    s.update({ api: { model: 'llama3' } }),
  ]).then(
    () => 'all saved',
    (e: Error) => `failed ${(e as { code?: string }).code ?? e.constructor.name}`,
  );
  out.push(`concurrent ${all}`, `view-concurrent ${hash(s.view(installed))}`, `file-concurrent ${read()}`);
  // What the file says after the three changes at once: the new side must hold all three (the values are the
  // differential's own, not his).
  let landed = 'unreadable';
  try {
    const f = JSON.parse(readFileSync(file, 'utf8')) as {
      tutor?: string;
      helpers?: string;
      api?: { model?: string };
      accent?: string;
      agentCommand?: string;
    };
    landed = `${f.tutor} ${f.helpers} ${f.api?.model}`;
    // What the three changes did not touch must still be there: the accent and his own command, if the start had them.
    out.push(`untouched ${hash([f.accent ?? null, f.agentCommand ?? null])}`);
  } catch {}
  out.push(`landed ${landed}`);
  console.log(out.join('\n'));
  process.exit(0);
}

const { dir, done } = workDir('settings-differential');
const ref = reference(dir);
const proxy = await refusingProxy();
let code = 1;
try {
  const real = path.resolve(option('--settings') ?? path.join(ROOT, '.aristotle/settings.json'));
  const full = JSON.stringify(
    {
      tutor: 'opencode',
      helpers: 'api',
      accent: 'violet',
      agentCommand: 'claude --model opus',
      api: { provider: 'openrouter', model: 'some/model', apiKey: 'sk-or-0123456789abcdef', baseUrl: 'https://openrouter.ai/api/v1' },
    },
    null,
    2,
  );
  const starts: [string, string | undefined][] = [
    ['this install', existsSync(real) ? readFileSync(real, 'utf8') : undefined],
    ['every key', `${full}\n`],
    ['a stray comma', '{"tutor": "codex", "agentCommand": "mine",}\n'],
  ];
  let same = true;
  for (const [name, start] of starts) {
    const run = (root: string, side: string) => {
      const file = path.join(dir, `${side}-${name.replace(/\W+/g, '-')}.json`);
      if (start !== undefined) writeFileSync(file, start);
      if (existsSync(file)) chmodSync(file, 0o600);
      const r = spawnSync(process.execPath, [import.meta.filename, '--run', root, file], {
        cwd: ROOT,
        env: hermeticEnv(proxy.url(side), {
          ARISTOTLE_SETTINGS: file,
          ARISTOTLE_STATE_DIR: path.join(dir, `state-${side}`),
          ARISTOTLE_DATA_DIR: path.join(dir, `data-${side}`),
          ARISTOTLE_API_KEY: '',
        }),
        encoding: 'utf8',
      });
      if (r.status !== 0) throw new Error(r.stderr);
      // A settings.json that could not be parsed: what is left beside it (set aside, or nothing).
      const aside = readdirSync(dir).filter((f) => f.startsWith(`${path.basename(file)}.`)).length;
      return [...r.stdout.trim().split('\n'), `set-aside ${aside}`];
    };
    console.log(`\n${name}${start === undefined ? ' (none: the defaults)' : ''}`);
    // Written before the run: main's settings.json shared one .tmp between writes, so three changes at once failed
    // (ENOENT on the rename) and what was saved depended on the race; the core queues them (Organon's red team, 0.2.0).
    const race = {
      concurrent: 'the core queues writes: three changes at once all land; main shared one .tmp and failed (ENOENT)',
      'view-concurrent': 'the same race: on main, which of the three landed depended on it',
      'file-concurrent': 'the same race',
      landed: 'the same race (on main, what the file holds afterwards depended on it)',
      untouched: 'the same race',
    };
    const allowed: Record<string, string> =
      name !== 'a stray comma'
        ? race
        : {
            ...race,
            // Written before the run, from the core's CHANGELOG (0.1.0) and Organon's settings-overwrite proof.
            file1:
              'the core never writes over a settings.json it could not parse: it sets it aside (main wrote the defaults over it, losing agentCommand)',
            file2: 'the same',
            'set-aside': 'the core never writes over a settings.json it could not parse: it keeps it beside, renamed; main wrote over it',
          };
    const a = run(ref.root, 'a');
    const b = run(ROOT, 'b');
    if (!compare(a, b, allowed)) same = false;
    // The race is allowed only because the new side wins it: all three changes saved, and all three in the file.
    let kept: unknown[] = [null, null];
    try {
      const f = JSON.parse(start ?? '') as { accent?: string; agentCommand?: string };
      kept = [f.accent ?? null, f.agentCommand ?? null];
    } catch {}
    for (const want of ['concurrent all saved', 'landed gemini claude-code llama3', `untouched ${hash(kept)}`])
      if (!b.includes(want)) {
        console.log(`new side: expected "${want}"`);
        same = false;
      }
  }
  const out = refused(proxy.calls);
  console.log(`\n${out.line}`);
  code = same && !out.lopsided ? 0 : 1;
  console.log(code ? 'DIFFERENT' : 'SAME');
  void copyFileSync;
} finally {
  proxy.close();
  ref.remove();
  done();
}
process.exit(code);
