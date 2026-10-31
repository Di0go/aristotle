// server/config.ts on the reference (main) against this checkout's (the core's defineApp over app.json, with
// Aristotle's own paths and settings on top): every value it exports, as each instance would see it, under several
// environments (live, live with trusted TLS, dev, every override live and dev, empty values). Paths are compared with
// the checkout's root named. The accent, which main's config.ts read from settings.json, is the settings' now
// (settings.accent): it is compared under ACCENT. Galen's scripts/proofs/config-differential.ts is the model.
//
//   node scripts/proofs/config-differential.ts [--ref <ref>]

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { compare, hermeticEnv, reference, refused, refusingProxy, ROOT, workDir } from './reference.ts';

if (process.argv[2] === '--run') {
  const root = process.argv[3] ?? '';
  const config = await import(path.join(root, 'server/config.ts'));
  const values: Record<string, unknown> = { ...config };
  delete values.app;
  if (!('ACCENT' in values)) values.ACCENT = (await import(path.join(root, 'server/settings.ts'))).settings.accent;
  const out = Object.keys(values)
    .sort()
    .map((k) => {
      const v = values[k];
      const shown = v instanceof Set ? [...v].sort() : v;
      return `${k} ${JSON.stringify(shown ?? null).replaceAll(root, '<root>')}`;
    });
  console.log(out.join('\n'));
  process.exit(0);
}

/**
 * What the core changed on purpose, by scenario and exported name; written before the run, from reading both. Narrow:
 * a name allowed in one scenario is compared exactly in the others.
 */
const DEV_NAME =
  'dev never takes the clean name: aristotle.test leads to the live app, never to dev (main took it when /etc/hosts listed it)';
const ALLOWED: Record<string, Record<string, string>> = {
  dev: { HOSTNAME_READY: DEV_NAME, ALLOWED_HOSTS: DEV_NAME, ALLOWED_ORIGINS: DEV_NAME },
  'dev, every override': { HOSTNAME_READY: DEV_NAME, ALLOWED_HOSTS: DEV_NAME, ALLOWED_ORIGINS: DEV_NAME },
  // Green is one of the core's accents (Galen's, now every app's); main's config.ts knew four and left green unset.
  'live, green accent': { ACCENT: 'green, now an accent of the core, is taken from settings.json; main ignored it (blue)' },
  'empty values': {
    // main kept "", which its readers (oneshot.ts, chat.ts) took as unset too.
    ONESHOT_CMD: 'an empty ARISTOTLE_ONESHOT_CMD is unset, as its readers already took it',
  },
};

const { dir, done } = workDir('config-differential');
const ref = reference(dir);
const proxy = await refusingProxy();
let code = 1;
try {
  const state = path.join(dir, 'state');
  mkdirSync(path.join(state, 'tls'), { recursive: true });
  writeFileSync(path.join(dir, 'settings.json'), '{"accent": "violet"}\n');
  writeFileSync(path.join(dir, 'settings-green.json'), '{"accent": "green"}\n');
  // A folder with no certificate, and one with a certificate the browsers trust (setup-hostname.sh's mark).
  const noTls = path.join(dir, 'no-tls');
  mkdirSync(noTls);
  writeFileSync(path.join(state, 'tls', 'server.crt'), '');
  writeFileSync(path.join(state, 'tls', 'installed'), '');
  const none = path.join(dir, 'no-settings.json');
  const scenarios: Record<string, Record<string, string>> = {
    live: { ARISTOTLE_TLS_DIR: noTls, ARISTOTLE_SETTINGS: none },
    'live, TLS trusted': { ARISTOTLE_TLS_DIR: path.join(state, 'tls'), ARISTOTLE_SETTINGS: none },
    dev: { ARISTOTLE_INSTANCE: 'dev', ARISTOTLE_TLS_DIR: path.join(state, 'tls'), ARISTOTLE_SETTINGS: none },
    'live, every override': {
      ARISTOTLE_PORT: '4999',
      ARISTOTLE_DATA_DIR: path.join(dir, 'data'),
      ARISTOTLE_STATE_DIR: state,
      ARISTOTLE_TLS_DIR: path.join(state, 'tls'),
      ARISTOTLE_TLS_PORT: '4998',
      ARISTOTLE_SETTINGS: path.join(dir, 'settings.json'),
      ARISTOTLE_VITE_PORT: '5999',
      ARISTOTLE_HOSTNAME: 'other.test',
      ARISTOTLE_BACKUP: 'off',
      ARISTOTLE_TERMINAL_QUIET_MS: '300',
      ARISTOTLE_CLAUDE_CMD: 'bash',
      ARISTOTLE_ONESHOT_MODEL: 'haiku',
      ARISTOTLE_API_KEY: 'sk-x',
      ARISTOTLE_COMMONS_API: 'http://127.0.0.1:1/w/api.php',
      ARISTOTLE_GLOSS_IMAGES: 'off',
      ARISTOTLE_ONESHOT_CMD: 'cat',
      ARISTOTLE_WAIT_MS: '1000',
      ARISTOTLE_WAIT_SLICE_MS: '500',
      ARISTOTLE_CLAUDE_CWD: path.join(dir, 'cwd'),
    },
    'dev, every override': {
      ARISTOTLE_INSTANCE: 'dev',
      ARISTOTLE_PORT: '4999',
      ARISTOTLE_VITE_PORT: '5999',
      ARISTOTLE_SETTINGS: path.join(dir, 'settings.json'),
    },
    'live, green accent': { ARISTOTLE_TLS_DIR: noTls, ARISTOTLE_SETTINGS: path.join(dir, 'settings-green.json') },
    'empty values': { ARISTOTLE_TLS_DIR: noTls, ARISTOTLE_SETTINGS: none, ARISTOTLE_API_KEY: '', ARISTOTLE_ONESHOT_CMD: '' },
  };
  let same = true;
  for (const [name, env] of Object.entries(scenarios)) {
    console.log(`\n${name}`);
    const run = (root: string, side: string) => {
      const r = spawnSync(process.execPath, [import.meta.filename, '--run', root], {
        cwd: ROOT,
        env: hermeticEnv(proxy.url(side), env),
        encoding: 'utf8',
      });
      if (r.status !== 0) throw new Error(r.stderr);
      return r.stdout.trim().split('\n');
    };
    same = compare(run(ref.root, 'a'), run(ROOT, 'b'), ALLOWED[name]) && same;
  }
  const out = refused(proxy.calls);
  console.log(`\n${out.line}`);
  code = same && !out.lopsided ? 0 : 1;
  console.log(code ? '\nDIFFERENT' : '\nSAME');
} finally {
  proxy.close();
  ref.remove();
  done();
}
process.exit(code);
