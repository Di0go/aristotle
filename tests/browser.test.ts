// In a real browser: what he is writing in an answer box stays there, focused and with the cursor where it was, while
// the tutor and the page go on around it. A real server on throwaway folders and a free port (as in mcp.test.ts), the
// built interface, a real MCP client in Claude Code's place, and a headless Chromium. Skipped where there is no
// Chromium (ARISTOTLE_TEST_CHROMIUM, the system's, or Playwright's own).
//
//   pnpm test

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { chromium, type Browser } from 'playwright-core';

const CHROMIUM = [process.env.ARISTOTLE_TEST_CHROMIUM, '/usr/bin/chromium', '/usr/bin/chromium-browser', chromium.executablePath()].find(
  (p): p is string => Boolean(p && existsSync(p)),
);

let BASE = '';
let server: ChildProcess;
let dataDir: string;
let stateDir: string;
let client: Client;
let browser: Browser | undefined;

before(async () => {
  if (!CHROMIUM) return;
  const port = await freePort();
  BASE = `http://localhost:${port}`;
  dataDir = await mkdtemp(path.join(tmpdir(), 'aristotle-test-'));
  stateDir = await mkdtemp(path.join(tmpdir(), 'aristotle-state-'));
  server = spawn('node', ['server/index.ts'], {
    env: {
      ...process.env,
      ARISTOTLE_PORT: String(port),
      ARISTOTLE_DATA_DIR: dataDir,
      ARISTOTLE_STATE_DIR: stateDir,
      ARISTOTLE_WAIT_MS: '300',
      ARISTOTLE_BACKUP: 'off',
      ARISTOTLE_CLAUDE_CMD: 'bash --norc --noprofile',
      ARISTOTLE_GLOSS_IMAGES: 'off',
    },
    stdio: 'inherit',
  });
  for (let i = 0; ; i++) {
    try {
      const health = (await (await fetch(`${BASE}/api/health`)).json()) as { pid?: number };
      if (health.pid === server.pid) break;
    } catch {}
    if (i > 50) throw new Error('Server did not start');
    await new Promise((r) => setTimeout(r, 100));
  }
  client = new Client({ name: 'test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)));
  browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
});

after(async () => {
  if (!CHROMIUM) return;
  await browser?.close();
  await client.close();
  server.kill();
  await rm(dataDir, { recursive: true, force: true });
  await rm(stateDir, { recursive: true, force: true });
});

const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args });

test('an answer being written survives the tutor and the feed: same box, same text, focus and cursor kept', {
  skip: !CHROMIUM && 'no Chromium',
}, async () => {
  // A question left open in one class, and another class going on now with a question of its own waiting.
  await call('start_session', { topic: 'Orbital mechanics', goal: 'Why orbits are ellipses' });
  await call('ask', { prompt: 'Why does a lower orbit go faster?', kind: 'explain' });
  await call('start_session', { topic: 'Tide pools', goal: 'What lives where' });
  await call('show', { markdown: 'The upper zone dries out twice a day.', title: 'Zones' });
  await call('ask', { prompt: 'Name one animal of the upper zone.', kind: 'recall' });

  const page = await browser!.newPage();
  // The page's clock an hour ahead: the class going on looks left alone, so the old question opens answerable, as it
  // did for him half an hour after the tutor's last step.
  await page.clock.install({ time: Date.now() + 60 * 60_000 });
  await page.goto(`${BASE}/#/lesson/orbital-mechanics/0`);
  const box = page.locator('section.ask textarea');
  await box.waitFor();
  await box.evaluate((el) => (el.dataset.mark = 'his'));
  await box.click();
  await page.keyboard.type('Because gravity pulls harder closer in');
  // He goes back to fix a word: the cursor sits in the middle of the text.
  await box.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(8, 8));
  await page.keyboard.type('the ');

  // While he writes: the page tells the server he is there (each minute), and the tutor carries on elsewhere.
  await page.clock.runFor(61_000);
  await page.waitForResponse((r) => r.url().endsWith('/api/presence')).catch(() => {});
  await call('update_map', { concepts: [{ id: 'upper-zone', label: 'Upper zone', status: 'shaky' }] });
  await call('show', { markdown: 'Barnacles close up when the tide goes out.', kind: 'note' });
  await page.clock.runFor(61_000);
  await page.waitForTimeout(500);

  const now = await page.evaluate(() => {
    const el = document.querySelector<HTMLTextAreaElement>('section.ask textarea');
    return { mark: el?.dataset.mark, value: el?.value, focused: document.activeElement === el, cursor: el?.selectionStart };
  });
  assert.deepEqual(now, { mark: 'his', value: 'Because the gravity pulls harder closer in', focused: true, cursor: 12 });

  // Sent while the other class is going on: the server can't take it yet, and says so; his text stays.
  await page.keyboard.press('Control+Enter');
  await page.locator('section.ask .error').waitFor();
  assert.match(await page.locator('section.ask .error').innerText(), /Another sitting is going on/);
  assert.equal(await box.inputValue(), 'Because the gravity pulls harder closer in');
  await page.close();
});

/** A port nothing listens on right now. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}
