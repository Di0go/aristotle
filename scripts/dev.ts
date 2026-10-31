// The dev instance: the core's runDev (@organon/core/server/dev): the server on its own port with its own data,
// restarted on every server change, and Vite serving the interface with hot reload in front of it. Nothing here can
// touch the live app or data/.
//
//   pnpm dev               seeds .dev/data with the demo library the first time, then runs
//   pnpm dev:snapshot      replaces .dev/data with a copy of your real data/ (read only, without its Git history)
//
// Claude Code can teach in it through the `aristotle-dev` MCP server (.mcp.json), to try a change end to end.

import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { runDev } from '@organon/core/server/dev';
import { DEV_DATA, seed } from './seed.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const REAL_DATA = path.join(ROOT, 'data');

// pnpm dev:snapshot: copy the real data in and stop. Its .git stays behind, so dev can never commit to it.
if (process.argv[2] === 'snapshot') {
  if (!existsSync(REAL_DATA)) throw new Error(`No ${REAL_DATA} to copy.`);
  rmSync(DEV_DATA, { recursive: true, force: true });
  cpSync(REAL_DATA, DEV_DATA, { recursive: true, filter: (src) => path.basename(src) !== '.git' });
  console.error(`Copied data/ to ${path.relative(ROOT, DEV_DATA)}. Restart pnpm dev if it is running.`);
  process.exit(0);
}

// pnpm dev: the demo library on first run, then the server and Vite side by side.
await seed();
runDev(ROOT, { banner: '  reset      pnpm seed --force\n  Claude     the aristotle-dev MCP server (.mcp.json)\n' });
