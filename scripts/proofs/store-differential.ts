// server/store.ts on the reference (main) against this checkout's (the shim over @organon/core's createStore), each
// on its own copy of the data: every JSON file and folder loaded and written back, a line appended to a chat and read
// again, a broken file set aside, and a file that is there but can't be read. Then both data folders file by file,
// and the warnings each said. Prints hashes, never values.
//
//   node scripts/proofs/store-differential.ts [--data <folder>] [--ref <ref>]

import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { compare, copyData, hash, hermeticEnv, reference, refused, refusingProxy, ROOT, sourceData, tree, workDir } from './reference.ts';

// One side, in a child of its own, so each reads its own copy (ARISTOTLE_DATA_DIR) and its module state is its own.
if (process.argv[2] === '--run') {
  const [, , , root = '', data = ''] = process.argv;
  const store = await import(path.join(root, 'server/store.ts'));
  const { warnings } = await import(path.join(root, 'server/warnings.ts'));
  const any = (v: unknown): v is unknown => v !== undefined;
  const out: string[] = [];
  const said = () =>
    hash(warnings.list().map((w: string) => w.replaceAll(data, '<data>').replace(/unreadable-[\w-]+/g, 'unreadable-<time>')));
  for (const e of readdirSync(data, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const f = path.join(data, e.name);
    if (e.isDirectory() && readdirSync(f).some((n) => n.endsWith('.json'))) {
      const all = await store.loadJsonDir(f, any);
      out.push(`dir:${e.name} ${all.length} ${hash(all)}`);
    } else if (e.isFile() && e.name.endsWith('.json')) {
      const v = await store.loadJson(f, any, null);
      out.push(`json:${e.name} ${hash(v)}`);
      await store.writeJson(f, v);
    }
  }
  // Written back whole: the same bytes, or the same normalised JSON.
  await store.writeFileAtomic(path.join(data, 'atomic.txt'), 'one\n');
  const log = new store.AppendLog('The chat', () => {});
  await log.append(path.join(data, 'chats', 'differential.jsonl'), { id: 'x', text: 'differential' });
  await log.idle();
  out.push(`readLog ${hash(await store.readLog(path.join(data, 'chats', 'differential.jsonl')))}`);
  const chats = existsSync(path.join(data, 'chats')) ? readdirSync(path.join(data, 'chats')).filter((n) => n.endsWith('.jsonl')) : [];
  for (const c of chats.sort()) out.push(`log:${c} ${hash(await store.readLog(path.join(data, 'chats', c)))}`);
  // The session logs, read whole, and one of them closed off (endLastLine) and appended to, as a new sitting does.
  const logs = existsSync(path.join(data, 'sessions')) ? readdirSync(path.join(data, 'sessions')).filter((n) => n.endsWith('.jsonl')) : [];
  for (const c of logs.sort()) out.push(`session:${c} ${hash(await store.readLog(path.join(data, 'sessions', c)))}`);
  const last = logs.sort().at(-1);
  if (last) {
    await store.endLastLine(path.join(data, 'sessions', last));
    await log.append(path.join(data, 'sessions', last), { type: 'differential' });
    await log.idle();
    out.push(`session-appended ${hash(await store.readLog(path.join(data, 'sessions', last)))}`);
  }
  // A broken file is set aside and said.
  writeFileSync(path.join(data, 'broken.json'), '{"a": 1,');
  out.push(`broken ${hash(await store.loadJson(path.join(data, 'broken.json'), any, 'fallback'))} ${said()}`);
  // A file that is there and can't be read: loaded as the fallback; then a write to it.
  const locked = path.join(data, 'locked.json');
  writeFileSync(locked, '{"kept": true}\n');
  chmodSync(locked, 0o000);
  out.push(`unreadable-load ${hash(await store.loadJson(locked, any, 'fallback'))}`);
  out.push(
    `unreadable-write ${await store.writeJson(locked, { lost: true }).then(
      () => 'written over',
      () => 'refused',
    )}`,
  );
  chmodSync(locked, 0o600);
  out.push(`warnings ${said()}`);
  console.log(out.join('\n'));
  process.exit(0);
}

const { dir, done } = workDir('store-differential');
let code = 1;
const ref = reference(dir);
const proxy = await refusingProxy();
try {
  const source = sourceData();
  const run = (root: string, data: string, side: string) => {
    copyData(source, data);
    const r = spawnSync(process.execPath, [import.meta.filename, '--run', root, data], {
      cwd: ROOT,
      env: hermeticEnv(proxy.url(side), { ARISTOTLE_DATA_DIR: data, ARISTOTLE_STATE_DIR: path.join(dir, 'state') }),
      encoding: 'utf8',
    });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout.trim().split('\n');
  };
  const a = run(ref.root, path.join(dir, 'a'), 'a');
  const b = run(ROOT, path.join(dir, 'b'), 'b');
  const same = compare(a, b, {
    'unreadable-write': 'the core never writes over a file it could not read (core 0.3.0); main wrote over it',
  });
  const ta = tree(path.join(dir, 'a'));
  const tb = tree(path.join(dir, 'b'));
  const names = [...new Set([...Object.keys(ta), ...Object.keys(tb)])].sort();
  // locked.json is the file the fix keeps: main wrote {lost: true} over it, the core refused.
  const changed = names.filter((n) => ta[n] !== tb[n] && n !== 'locked.json');
  for (const n of changed) console.log(`file ${n} DIFFERENT`);
  console.log(
    `files: ${names.length} compared, ${changed.length} different (locked.json aside: ${ta['locked.json'] === tb['locked.json'] ? 'same' : 'kept by the core'})`,
  );
  const out = refused(proxy.calls);
  console.log(out.line);
  code = same && !changed.length && !out.lopsided ? 0 : 1;
  console.log(code ? 'DIFFERENT' : 'SAME');
} finally {
  proxy.close();
  ref.remove();
  done();
}
process.exit(code);
