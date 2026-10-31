// The shell scripts on the reference (main: scripts/install-service.sh, tls.sh, setup-hostname.sh) against the
// core's, which read app.json, without touching the system:
//   - install-service.sh, each with a systemctl that only records what it is asked, under a throwaway HOME: the unit
//     each writes (with the checkout named) and the systemctl calls;
//   - tls.sh, each into a throwaway folder: what the authority and the certificate say (subject, issuer, extensions,
//     name constraints, key size), without keys, serials or dates;
//   - setup-hostname.sh: the core's --print (no root) against what main's run left in /etc (read only): the nft rule
//     and the unit, and the hosts line.
//
// Galen's scripts/proofs/scripts-differential.ts is the model; main's gym.test cleanup is scripts/retire-gym-test.sh
// now, and is left out of both sides (a hosts file or trust store without gym.test, as this machine's).
//
//   node scripts/proofs/scripts-differential.ts [--ref <ref>]

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { compare, hash, reference, ROOT, workDir } from './reference.ts';

const { dir, done } = workDir('scripts-differential');
const ref = reference(dir);
const core = path.join(ROOT, 'node_modules/@organon/core/scripts');
let code = 1;
try {
  const lines = (side: 'ref' | 'new') => {
    const out: string[] = [];
    const work = path.join(dir, `${side}-side`);
    const home = path.join(work, 'home');
    const bin = path.join(work, 'bin');
    mkdirSync(bin, { recursive: true });
    mkdirSync(home, { recursive: true });
    const calls = path.join(work, 'calls');
    writeFileSync(
      path.join(bin, 'systemctl'),
      `#!/bin/sh\necho "$@" >> ${JSON.stringify(calls)}\ncase "$*" in *is-enabled*) exit 1;; esac\nexit 0\n`,
    );
    chmodSync(path.join(bin, 'systemctl'), 0o755);
    const root = side === 'ref' ? ref.root : ROOT;
    const env = {
      ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ARISTOTLE_'))),
      HOME: home,
      PATH: `${bin}:${process.env.PATH}`,
      ARISTOTLE_DATA_DIR: path.join(work, 'data'),
      ARISTOTLE_STATE_DIR: path.join(work, 'state'),
    };
    const install = side === 'ref' ? ['scripts/install-service.sh'] : [path.join(core, 'install-service.sh'), root];
    const r = spawnSync('bash', install, { cwd: root, env, encoding: 'utf8' });
    out.push(`install-exit ${r.status}`);
    const unit = path.join(home, '.config/systemd/user/aristotle.service');
    const text = existsSync(unit) ? readFileSync(unit, 'utf8').replaceAll(work, '<work>').replaceAll(root, '<root>') : 'none';
    // Line by line, comments aside (main's said "Claude Code lives in ~/.local/bin", the core's "Agent CLIs").
    for (const [i, l] of text.split('\n').entries()) if (!l.startsWith('#')) out.push(`unit:${i} ${hash(l)}`);
    out.push(`unit-settings ${hash(text.split('\n').filter((l) => !l.startsWith('#')))}`);
    out.push(`systemctl ${(existsSync(calls) ? readFileSync(calls, 'utf8') : '').trim().split('\n').join(' | ')}`);
    out.push(`compile-cache ${existsSync(path.join(work, 'state', 'compile-cache'))}`);

    const tls = path.join(work, 'tls');
    const made = spawnSync('bash', side === 'ref' ? ['scripts/tls.sh'] : [path.join(core, 'tls.sh'), root], {
      cwd: root,
      env: { ...env, ARISTOTLE_TLS_DIR: tls },
      encoding: 'utf8',
    });
    out.push(`tls-exit ${made.status}`);
    for (const f of ['ca.crt', 'server.crt']) {
      const x = spawnSync(
        'openssl',
        ['x509', '-in', path.join(tls, f), '-noout', '-text', '-certopt', 'no_pubkey,no_sigdump,no_serial,no_validity'],
        {
          encoding: 'utf8',
        },
      ).stdout;
      // Key identifiers are hashes of the key: they differ by nature, as the keys do.
      const said = x
        .split('\n')
        .filter((l) => !/^\s+[0-9A-F]{2}(:[0-9A-F]{2})+\s*$/.test(l))
        .join('\n');
      out.push(`${f} ${hash(said)}`);
    }
    out.push(
      `modes ${['ca.key', 'server.key'].map((f) => (existsSync(path.join(tls, f)) ? spawnSync('stat', ['-c', '%a', path.join(tls, f)], { encoding: 'utf8' }).stdout.trim() : 'none')).join(',')}`,
    );
    return out;
  };
  // Before installing, a server running without the service is stopped: main asked its control.ts (which asks
  // systemctl twice more whether the service is on), the core reads the pid file itself. The same hand-over.
  const same = compare(lines('ref'), lines('new'), { systemctl: 'the hand-over before installing asks systemctl fewer times' });

  // setup-hostname.sh: what the core would write against what main's run wrote.
  console.log('\nsetup-hostname.sh: the core --print, against /etc as main left it');
  const print = spawnSync('bash', [path.join(core, 'setup-hostname.sh'), ROOT, '--print'], { encoding: 'utf8' }).stdout;
  // Its sections: a line "/etc/<file>:" (or "/etc/hosts gets:"), then the text, up to the next one or "trusted:".
  const sections = new Map<string, string>();
  let current = '';
  for (const line of print.split('\n')) {
    const head = /^(\/etc\/\S+?)( gets)?:$/.exec(line);
    if (head) sections.set((current = head[1] ?? ''), '');
    else if (line.startsWith('trusted:')) current = '';
    else if (current) sections.set(current, `${sections.get(current)}${line}\n`);
  }
  const section = (file: string) => (sections.get(file) ?? '').trim();
  const now = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8').trim() : 'missing');
  // The hosts line (the comment above it says where the checkout is: main wrote ~, the core the whole path; the
  // core only ever adds the lines when the name is missing, so the one there stays as it is).
  const named = (text: string) =>
    text
      .split('\n')
      .filter((l) => !l.startsWith('#') && /\saristotle\.test(\s|$)/.test(l))
      .join('\n');
  const hostsLine = named(now('/etc/hosts'));
  const etc = [
    `nft ${hash(now('/etc/aristotle.nft'))}`,
    `unit ${hash(now('/etc/systemd/system/aristotle-nome.service'))}`,
    `hosts ${hash(hostsLine)}`,
  ];
  const printed = [
    `nft ${hash(section('/etc/aristotle.nft'))}`,
    `unit ${hash(section('/etc/systemd/system/aristotle-nome.service'))}`,
    `hosts ${hash(named(section('/etc/hosts')))}`,
  ];
  const hostname = compare(etc, printed);
  if (!hostname) console.log(print);
  code = same && hostname ? 0 : 1;
  console.log(code ? 'DIFFERENT' : 'SAME');
} finally {
  ref.remove();
  done();
}
process.exit(code);
