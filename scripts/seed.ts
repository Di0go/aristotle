// Fills the dev instance's data with a fixture (scripts/fixtures/<name>.ts, "demo" by default) by replaying it
// through a throwaway server's MCP endpoint, exactly as Claude Code would teach it.
//
//   pnpm seed              seeds .dev/data if it is empty
//   pnpm seed --force      replaces .dev/data (stop pnpm dev first)
//   pnpm seed other        another fixture
//
// It only ever writes to the dev data directory, and refuses to touch one that is a Git repository
// (your real learning history is one).

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FeedState } from '../shared/types.ts';
import type { Step } from './fixtures/demo.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
export const DEV_DATA = path.resolve(process.env.ARISTOTLE_DATA_DIR ?? path.join(ROOT, '.dev/data'));
const SEED_PORT = 4759;
const BASE = `http://localhost:${SEED_PORT}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isEmpty = (dir: string) => !existsSync(dir) || readdirSync(dir).length === 0;

export async function seed(fixture = 'demo', force = false): Promise<void> {
  if (existsSync(path.join(DEV_DATA, '.git')) || DEV_DATA === path.join(ROOT, 'data')) {
    throw new Error(`Refusing to seed ${DEV_DATA}: it looks like a real learning history.`);
  }
  if (!isEmpty(DEV_DATA)) {
    if (!force) {
      console.error(`${path.relative(ROOT, DEV_DATA)} already has data; pnpm seed --force replaces it.`);
      return;
    }
    rmSync(DEV_DATA, { recursive: true, force: true });
  }

  const { steps } = (await import(`./fixtures/${fixture}.ts`)) as { steps: Step[] };
  const state = mkdtempSync(path.join(tmpdir(), 'aristotle-seed-'));
  const server = spawn(process.execPath, [path.join(ROOT, 'server/index.ts')], {
    cwd: ROOT,
    env: {
      ...process.env,
      ARISTOTLE_INSTANCE: 'dev',
      ARISTOTLE_PORT: String(SEED_PORT),
      ARISTOTLE_DATA_DIR: DEV_DATA,
      ARISTOTLE_STATE_DIR: state,
      ARISTOTLE_WAIT_MS: '10000',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const client = new Client({ name: 'seed', version: '0' });
  try {
    for (let i = 0; ; i++) {
      try {
        if ((await fetch(`${BASE}/api/health`)).ok) break;
      } catch {}
      if (i > 50) throw new Error('The seed server did not start');
      await sleep(100);
    }
    await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)));

    // A quiz or ask waits for its answer, so it runs alongside the answer step that follows it.
    let waiting: Promise<unknown> | undefined;
    for (const step of steps) {
      if ('tool' in step) {
        const call = client.callTool({ name: step.tool, arguments: step.args });
        if (step.tool === 'quiz' || step.tool === 'ask') waiting = call;
        else {
          const result = await call;
          if (result.isError) throw new Error(`${step.tool}: ${JSON.stringify(result.content)}`);
        }
        continue;
      }
      const item = await pending();
      await fetch(`${BASE}/api/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item, ...step.answer }),
      });
      await waiting;
      waiting = undefined;
    }
    console.error(`Seeded ${path.relative(ROOT, DEV_DATA)} with "${fixture}" (${steps.length} steps).`);
  } finally {
    await client.close().catch(() => {});
    server.kill();
    rmSync(state, { recursive: true, force: true });
  }
}

async function pending(): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const state = (await (await fetch(`${BASE}/api/state`)).json()) as FeedState;
    const item = state.items.find((x) => (x.type === 'quiz' || x.type === 'ask') && !x.answeredAt);
    if (item) return item.id;
    await sleep(50);
  }
  throw new Error('No question is waiting for an answer');
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  await seed(
    args.find((a) => !a.startsWith('--')),
    args.includes('--force'),
  );
}
