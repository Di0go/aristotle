// In a real browser: what he is writing in an answer box stays there, focused and with the cursor where it was, while
// the tutor and the page go on around it. A real server on throwaway folders and a free port (the core's startServer),
// the built interface, a real MCP client in Claude Code's place, and a headless Chromium. Skipped where there is no
// Chromium (ARISTOTLE_TEST_CHROMIUM, the system's, or Playwright's own).
//
//   pnpm test

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { findChromium, type Running, startServer } from '@organon/core/testing';

const ROOT = path.resolve(import.meta.dirname, '..');
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { chromium, type Browser } from 'playwright-core';

// The core's: the Chromium to run in (ARISTOTLE_TEST_CHROMIUM, the system's, or Playwright's own; in Organon's canary
// a missing one is a failure, not a skip), and a real server on throwaway folders and a free port.
const CHROMIUM = findChromium(process.env.ARISTOTLE_TEST_CHROMIUM, chromium.executablePath());

let BASE = '';
let server: Running;
let client: Client;
let browser: Browser | undefined;

before(async () => {
  if (!CHROMIUM) return;
  server = await startServer(ROOT, {
    env: { WAIT_MS: '300', BACKUP: 'off', CLAUDE_CMD: 'bash --norc --noprofile', GLOSS_IMAGES: 'off' },
  });
  BASE = server.base;
  client = new Client({ name: 'test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`)));
  browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
});

after(async () => {
  if (!CHROMIUM) return;
  await browser?.close();
  await client.close();
  await server.stop();
  await rm(server.dataDir, { recursive: true, force: true });
  await rm(server.stateDir, { recursive: true, force: true });
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

  // Sent while the other class is going on: he moves between classes freely, so it is taken, and shows as his answer.
  await page.keyboard.press('Control+Enter');
  const answer = page.locator('section.ask.answered .your-answer');
  await answer.waitFor();
  assert.match(await answer.innerText(), /Because the gravity pulls harder closer in/);
  assert.equal(await page.locator('section.ask .error').count(), 0);
  await page.close();
});
