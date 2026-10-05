// The dev instance: the server on its own port with its own data, restarted on every server change, and Vite
// serving the interface with hot reload in front of it. Nothing here can touch the live app or data/.
//
//   pnpm dev               seeds .dev/data with the demo library the first time, then runs
//   pnpm dev:snapshot      replaces .dev/data with a copy of your real data/ (read only, without its Git history)
//
// Claude Code can teach in it through the `aristotle-dev` MCP server (.mcp.json), to try a change end to end.

import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DEV_DATA, seed } from './seed.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = process.env.ARISTOTLE_PORT ?? '4757';
const VITE_PORT = process.env.ARISTOTLE_VITE_PORT ?? '5173';
const REAL_DATA = path.join(ROOT, 'data');

if (process.argv[2] === 'snapshot') {
  if (!existsSync(REAL_DATA)) throw new Error(`No ${REAL_DATA} to copy.`);
  rmSync(DEV_DATA, { recursive: true, force: true });
  cpSync(REAL_DATA, DEV_DATA, { recursive: true, filter: (src) => path.basename(src) !== '.git' });
  console.error(`Copied data/ to ${path.relative(ROOT, DEV_DATA)}. Restart pnpm dev if it is running.`);
  process.exit(0);
}

await seed();

const env = { ...process.env, ARISTOTLE_INSTANCE: 'dev', ARISTOTLE_PORT: PORT, ARISTOTLE_VITE_PORT: VITE_PORT };
const children: ChildProcess[] = [
  spawn(process.execPath, ['--watch', '--watch-preserve-output', 'server/index.ts'], { cwd: ROOT, env, stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { cwd: ROOT, env, stdio: 'inherit' }),
];

console.error(
  `\n  Aristotle dev  http://localhost:${VITE_PORT}  (hot reload)\n` +
    `  server         http://localhost:${PORT}  (restarts on change)\n` +
    `  data           ${path.relative(ROOT, DEV_DATA)}  (pnpm seed --force to reset)\n` +
    `  Claude Code    the aristotle-dev MCP server\n`,
);

const stop = () => {
  for (const c of children) c.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const c of children) c.on('exit', (code) => code && stop());
