// The dev instance starts and draws its pages: Vite serving the interface from source, with the core in
// node_modules, in front of a dev server, as `pnpm dev` does. The build alone does not prove it (the core's 0.1.0
// built and did not start), so this runs in the gates, in a headless Chromium; the server and its folders are
// throwaway ones (the core's startServer), never the dev instance's.

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { findChromium, freePort, type Running, startServer } from '@organon/core/testing';
import { type Browser, chromium } from 'playwright-core';

const ROOT = new URL('..', import.meta.url).pathname;
const CHROMIUM = findChromium(process.env.ARISTOTLE_TEST_CHROMIUM, chromium.executablePath());
let server: Running;
let vite: ChildProcess;
let base = '';
let browser: Browser | undefined;
let viteLog = '';

before(async () => {
  // The server answers only its own pages: Vite's port is one of them, so it is told which.
  const port = await freePort();
  server = await startServer(ROOT, {
    env: { VITE_PORT: String(port), BACKUP: 'off', GLOSS_IMAGES: 'off', CLAUDE_CMD: 'bash --norc --noprofile' },
  });
  base = `http://localhost:${port}`;
  vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--force'], {
    cwd: ROOT,
    env: { ...process.env, ARISTOTLE_VITE_PORT: String(port), ARISTOTLE_PORT: String(server.port), ARISTOTLE_INSTANCE: 'dev' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const s of [vite.stdout, vite.stderr]) s?.on('data', (d: Buffer) => (viteLog += d.toString()));
  if (CHROMIUM) browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
});

after(async () => {
  await browser?.close();
  vite.kill();
  await server.stop();
  await rm(server.dataDir, { recursive: true, force: true });
  await rm(server.stateDir, { recursive: true, force: true });
});

test('pnpm dev: Vite serves the pages from source, /api reaches the dev server, no error', { skip: !CHROMIUM }, async () => {
  const page = await browser!.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  await page.goto(base);
  // The dev instance says so in the tab's title, once the state has come through Vite from the dev server.
  await page
    .waitForFunction(() => document.title.startsWith('[dev]'), undefined, { timeout: 15_000 })
    .catch((e) => {
      throw new Error(`${e.message}\nerrors: ${errors.join(' | ')}\nvite: ${viteLog.slice(-1500)}\nserver: ${server.log().slice(-1500)}`);
    });
  for (const hash of ['#/map', '#/progress', '#/roadmaps', '#/settings']) {
    await page.goto(`${base}/${hash}`);
    await page.locator('h1').first().waitFor({ timeout: 10_000 });
    await page.waitForTimeout(500);
  }
  assert.deepEqual(errors, []);
  assert.doesNotMatch(viteLog, /error/i, viteLog);
  await page.close();
});
