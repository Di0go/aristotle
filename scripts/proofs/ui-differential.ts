// The interface on the reference (main) against this checkout's: each built and served by its own server on its own
// copy of the same data, both opened in one headless Chromium, every page in light and dark, on a wide screen and a
// phone's, then compared pixel by pixel and by the text the page shows. Nothing the learner sees should change unless
// it is listed in ALLOWED with its reason, written before the run that needs it. Prints route names, counts and
// hashes, never the text: the data is the learner's. Galen's scripts/proofs/ui-differential.ts is the model.
//
//   node scripts/proofs/ui-differential.ts [--data <folder>] [--ref <ref>] [--keep <folder>] [--only <route regex>]
//
// --keep saves the screenshots of pages that differ (ref, new) in that folder, to look at; never on the real data.
//
// Hermetic: the same verdict with or without a network. Both servers reach the outside only through a proxy here that
// refuses every call and counts it (Settings asks the model provider, OpenRouter by default, for its models), and the
// browser loads nothing but the two servers. The errors of both sides are compared: one only on the new side is a
// difference, the same on both is not (Galen's review saw a 502 from openrouter.ai counted against the new side alone).

import { createHash } from 'node:crypto';
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { type Browser, chromium, type Page } from 'playwright-core';
import { copyData, hermeticEnv, option, reference, refused, ROOT, refusingProxy, sourceData, workDir } from './reference.ts';

/**
 * Pages that may differ, by route, with why: only in their pixels, never in what they say (the text, the look on
 * <html>, the tab's title). Each written before the run that needed it.
 */
const ALLOWED: Record<string, string> = {
  // 9/n: --series-1..3 were the accent, --shaky and --solid; the core's are fixed, validated for colour blindness.
  '#/progress': "the chart's three series are the core's fixed colours, safe for colour blindness, no longer the accent",
};
/** Looks that may differ on every page, by accent, with why: the pixels and the tab's icon (drawn in the accent). */
const ALLOWED_LOOKS: Record<string, string> = {
  // 9/n: the core's tokens (Galen's, 0.5.1).
  red: "the red accent is the core's crimson, so a link never reads as the red of an error (and errors move off it)",
};

const hash = (v: string) => createHash('sha256').update(v).digest('hex').slice(0, 12);

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

/** Whether a URL is one of the two servers' (or the page's own data and blobs). */
const local = (url: string) => /^(data|blob|about):/.test(url) || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(url);

/** An error as both sides can say it: each server has its own port. */
const sameAcross = (e: string) => e.replace(/(localhost|127\.0\.0\.1):\d+/g, '$1:PORT');

async function serve(root: string, dir: string, source: string, proxy: string): Promise<{ base: string; child: ChildProcess }> {
  const data = path.join(dir, 'data');
  const state = path.join(dir, 'state');
  copyData(source, data);
  mkdirSync(state, { recursive: true });
  const port = await freePort();
  const env = hermeticEnv(proxy, {
    ARISTOTLE_PORT: String(port),
    ARISTOTLE_TLS_PORT: String(await freePort()),
    ARISTOTLE_DATA_DIR: data,
    ARISTOTLE_STATE_DIR: state,
    ARISTOTLE_TLS_DIR: path.join(state, 'tls'),
    ARISTOTLE_BACKUP: 'off',
    ARISTOTLE_GLOSS_IMAGES: 'off',
    ARISTOTLE_CLAUDE_CMD: 'bash --norc --noprofile',
    ARISTOTLE_CLAUDE_CWD: path.join(state, 'claude'),
    ARISTOTLE_ONESHOT_CMD: 'cat',
  });
  const child = spawn(process.execPath, ['--import', path.join(import.meta.dirname, 'seeded-random.ts'), 'server/index.ts'], {
    cwd: root,
    env,
    stdio: 'ignore',
  });
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return { base, child };
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`The server in ${root} did not start`);
}

/** The routes to open: every page, and one of each kind of record the data has. */
async function routes(base: string): Promise<string[]> {
  const get = async <T>(p: string) => (await (await fetch(`${base}${p}`)).json()) as T;
  const topics = await get<{ slug: string }[]>('/api/topics');
  const roadmaps = await get<{ slug: string }[]>('/api/roadmaps');
  const sessions = await get<{ id: string }[]>('/api/sessions');
  const missions = await get<{ id: string }[]>('/api/missions');
  const out = ['#/', '#/review', '#/progress', '#/map', '#/roadmaps', '#/topics', '#/log', '#/praxis', '#/about', '#/settings'];
  for (const t of topics.slice(0, 2)) {
    const slug = encodeURIComponent(t.slug);
    out.push(`#/topics/${slug}`, `#/lesson/${slug}`, `#/lesson/${slug}/1`, `#/train/${slug}`);
  }
  for (const r of roadmaps.slice(0, 2)) out.push(`#/roadmaps/${encodeURIComponent(r.slug)}`);
  for (const x of sessions.slice(0, 2)) out.push(`#/log/${encodeURIComponent(x.id)}`);
  for (const m of missions.slice(0, 1)) out.push(`#/praxis/${encodeURIComponent(m.id)}`);
  return out;
}

/** The page at `route`, drawn and settled: its screenshot and its text. */
async function shoot(page: Page, base: string, route: string): Promise<{ png: Buffer; text: string; height: number; glyph: string }> {
  await page.goto(`${base}/${route}`);
  await page.locator('main').first().waitFor({ timeout: 10_000 });
  // Fonts, the state, charts drawn; then no caret, no animation, no transition (prefers-reduced-motion is set too).
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  // The small screen's search glyph drew filled (a black disc) on main and is stroked in the core (0.5.0): it is
  // checked on its own (its fill and stroke) and hidden from the picture.
  // The same with the gap between the status line's items on a phone: 16 px on main, the core's 10 px below 640 px.
  const glyph = await page.evaluate(() => {
    const p = document.querySelector('.mobile-search svg path');
    const line = document.querySelector('.statusline');
    const gap = line ? `gap ${getComputedStyle(line).columnGap}` : '';
    return p && getComputedStyle(p).display !== 'none'
      ? `fill ${getComputedStyle(p).fill}, stroke ${getComputedStyle(p).stroke}, ${gap}`
      : gap;
  });
  await page.addStyleTag({
    content:
      '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' +
      '.mobile-search svg{visibility:hidden!important}' +
      '@media (max-width: 640px){.statusline{gap:10px!important}}',
  });
  await page.mouse.move(0, 0);
  // What the page shows, and what is set on it: the look on <html>, the tab's title and icon.
  const text = await page.evaluate(
    () =>
      `${document.body.innerText}\n${document.documentElement.dataset.theme} ${document.documentElement.dataset.accent} ${document.title}\n` +
      (document.querySelector('link[rel="icon"]')?.getAttribute('href') ?? ''),
  );
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  return { png: await page.screenshot({ fullPage: true }), text, height, glyph };
}

/** What opens on the frame, from Home, each shot once open: by name, the action that opens it. */
const OPENINGS: [name: string, wide: boolean, open: (page: Page) => Promise<void>][] = [
  ['search, empty', true, (p) => p.keyboard.press('Control+k')],
  [
    'search, a query',
    true,
    async (p) => {
      await p.keyboard.press('Control+k');
      await p.keyboard.type('sono');
      await p.waitForTimeout(700);
    },
  ],
  ['appearance', true, (p) => p.getByRole('button', { name: 'Appearance' }).click()],
  ['focus', true, (p) => p.keyboard.press('f')],
  [
    'menu on selected text',
    true,
    async (p) => {
      await p.evaluate(() => {
        const h = document.querySelector('main h1, main h2');
        if (!h) return;
        const r = document.createRange();
        r.selectNodeContents(h);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(r);
      });
      const box = await p.locator('main h1, main h2').first().boundingBox();
      if (box) await p.mouse.click(box.x + 10, box.y + 5, { button: 'right' });
    },
  ],
  ['the library on a phone', false, (p) => p.getByRole('button', { name: 'Open the library' }).click()],
  [
    // The core's AgentSettings: choosing the model API opens its section (nothing is saved).
    'the model API in Settings',
    true,
    async (p) => {
      await p.goto(`${new URL(p.url()).origin}/#/settings`);
      await p.getByRole('radio', { name: /A model API/ }).check();
      await p.getByRole('heading', { name: 'The model API' }).waitFor();
    },
  ],
  [
    'the drawer',
    true,
    async (p) => {
      // A shell runs in the tutor's place (ARISTOTLE_CLAUDE_CMD); its prompt is the same on both sides.
      await p.keyboard.press('Control+`');
      await p.waitForTimeout(1500);
    },
  ],
  // Last, since it writes (the same on both sides): what they wrote about themselves reaches the open page over the
  // live feed.
  [
    'About you arrives',
    true,
    async (p) => {
      await p.evaluate(async () => {
        await fetch('/api/about', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: '{"text":"Written by the UI differential.\\n"}',
        });
      });
      await p.waitForTimeout(1200);
    },
  ],
];

/** What may differ once opened, with why. */
const OPENED_ALLOWED: Record<string, string> = {};

/** Home, then `open`, settled: its picture and text. Focus mode is left again after, as he would. */
async function opened(page: Page, base: string, open: (page: Page) => Promise<void>) {
  const home = await shoot(page, base, '#/');
  void home;
  await open(page);
  await page.waitForTimeout(400);
  // Settled: what opened may still be filling in (the library loads its list); the same text twice in a row, 300 ms
  // apart, up to 3 s, on both sides alike.
  let text = await page.evaluate(() => document.body.innerText);
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(300);
    const again = await page.evaluate(() => document.body.innerText);
    if (again === text) break;
    text = again;
  }
  const png = await page.screenshot();
  await page.keyboard.press('Escape');
  await page.evaluate(
    () => document.documentElement.classList.contains('focus') && document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })),
  );
  // The drawer and the chat beside the page stay open across pages: closed again, so the next opening starts alike.
  if (await page.locator('.drawer.open').count()) await page.keyboard.press('Control+`');
  await page.evaluate(() => {
    try {
      localStorage.removeItem('aristotle.focus');
    } catch {}
    document.documentElement.classList.remove('focus');
  });
  return { png, text };
}

/** How many pixels two PNGs differ in, counted in the browser (no image library needed). */
async function differ(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(
    async ([x, y]) => {
      const load = async (b64: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height);
      };
      const [p, q] = [await load(x), await load(y)];
      if (p.width !== q.width || p.height !== q.height) return -1;
      let n = 0;
      for (let i = 0; i < p.data.length; i += 4)
        if (
          Math.abs(p.data[i]! - q.data[i]!) > 8 ||
          Math.abs(p.data[i + 1]! - q.data[i + 1]!) > 8 ||
          Math.abs(p.data[i + 2]! - q.data[i + 2]!) > 8
        )
          n++;
      return n;
    },
    [a.toString('base64'), b.toString('base64')] as const,
  );
}

const { dir, done } = workDir('ui-differential');
const ref = reference(dir, true);
const keep = option('--keep');
let browser: Browser | undefined;
const children: ChildProcess[] = [];
const proxies = await refusingProxy();
const blocked = { a: 0, b: 0 };
let code = 1;
try {
  const source = sourceData();
  for (const root of [ref.root, ROOT])
    if (spawnSync('pnpm', ['build', '--logLevel', 'error'], { cwd: root, stdio: 'inherit' }).status !== 0)
      throw new Error(`build failed in ${root}`);
  const a = await serve(ref.root, path.join(dir, 'a'), source, proxies.url('a'));
  const b = await serve(ROOT, path.join(dir, 'b'), source, proxies.url('b'));
  children.push(a.child, b.child);
  browser = await chromium.launch({ executablePath: process.env.ARISTOTLE_TEST_CHROMIUM ?? '/usr/bin/chromium', headless: true });
  const only = option('--only');
  const list = (await routes(a.base)).filter((r) => !only || new RegExp(only).test(r));
  let same = 0;
  let allowed = 0;
  let different = 0;
  const glyphs = new Set<string>();
  let glyphAllowed = 0;
  let glyphDifferent = 0;
  for (const [vw, vh, label] of [
    [1600, 1000, 'wide'],
    [390, 844, 'phone'],
  ] as const) {
    // Aristotle follows the system's mode and is blue unless one is picked (theme.svelte.ts keeps both in
    // localStorage): every page in dark and light blue, and two pages in each other accent main has.
    const looks: [mode: 'dark' | 'light', accent: string, pages: string[]][] = [
      ['dark', 'blue', list],
      ['light', 'blue', list],
      ...['red', 'violet', 'graphite'].flatMap((accent) =>
        (['dark', 'light'] as const).map((mode): ['dark' | 'light', string, string[]] => [mode, accent, list.slice(0, 2)]),
      ),
    ];
    for (const [mode, accent, pages] of looks) {
      const scheme = accent === 'blue' ? mode : `${mode} ${accent}`;
      const context = await browser.newContext({
        viewport: { width: vw, height: vh },
        colorScheme: mode,
        reducedMotion: 'reduce',
        timezoneId: 'Europe/Lisbon',
        locale: 'pt-PT',
      });
      await context.addInitScript((look) => localStorage.setItem('aristotle.look', look), JSON.stringify({ mode, accent }));
      const [pa, pb] = [await context.newPage(), await context.newPage()];
      const errors = { a: [] as string[], b: [] as string[] };
      for (const [side, page] of [
        ['a', pa],
        ['b', pb],
      ] as const) {
        await page.route('**/*', (r) => {
          if (local(r.request().url())) return r.continue();
          blocked[side]++;
          return r.abort();
        });
        page.on('pageerror', (e) => errors[side].push(sameAcross(String(e))));
        page.on('console', (m) => m.type() === 'error' && !/WebSocket|terminal/.test(m.text()) && errors[side].push(sameAcross(m.text())));
      }
      for (const route of pages) {
        const [ra, rb] = [await shoot(pa, a.base, route), await shoot(pb, b.base, route)];
        const pixels = await differ(pa, ra.png, rb.png);
        const textSame = ra.text === rb.text;
        const ok = pixels === 0 && textSame;
        // Another accent may change the pixels and the tab's icon (drawn in the accent), never what the page says.
        const iconAside = (t: string) => t.slice(0, t.lastIndexOf('\n'));
        const why =
          (textSame ? ALLOWED[route] : undefined) ?? (iconAside(ra.text) === iconAside(rb.text) ? ALLOWED_LOOKS[accent] : undefined);
        // The glyph and the gap, hidden from the picture, are checked here: the only change allowed is main's filled
        // glyph (any gap) to the core's stroked one with its 10 px gap, the same stroke; anything else is a difference.
        if (ra.glyph !== rb.glyph) {
          glyphs.add(`${ra.glyph} -> ${rb.glyph}`);
          const from = /^fill rgb\(0, 0, 0\), stroke (rgb\([^)]*\)), gap (16|10)px$/.exec(ra.glyph);
          if (from && rb.glyph === `fill none, stroke ${from[1]}, gap 10px`) glyphAllowed++;
          else glyphDifferent++;
        }
        if (ok) same++;
        else if (why) allowed++;
        else different++;
        const name = `${label} ${scheme} ${route}`;
        const detail = ok
          ? ''
          : ` pixels ${pixels === -1 ? `size ${ra.height}->${rb.height}` : pixels}, text ${textSame ? 'same' : `different (${hash(ra.text)} -> ${hash(rb.text)})`}`;
        console.log(`${name.padEnd(60)} ${ok ? 'same' : why ? `allowed (${why})` : 'DIFFERENT'}${detail}`);
        if (!ok && keep) {
          mkdirSync(keep, { recursive: true });
          const file = name.replace(/[^\w-]+/g, '_');
          writeFileSync(path.join(keep, `${file}.ref.png`), ra.png);
          writeFileSync(path.join(keep, `${file}.new.png`), rb.png);
        }
      }
      if (accent === 'blue')
        for (const [what, wideOnly, open] of OPENINGS) {
          if (wideOnly !== (label === 'wide')) continue;
          const [ra, rb] = [await opened(pa, a.base, open), await opened(pb, b.base, open)];
          const pixels = await differ(pa, ra.png, rb.png);
          const ok = pixels === 0 && ra.text === rb.text;
          const why = OPENED_ALLOWED[what];
          if (ok) same++;
          else if (why) allowed++;
          else different++;
          const name = `${label} ${scheme} opened: ${what}`;
          console.log(
            `${name.padEnd(60)} ${ok ? 'same' : why ? `allowed (${why})` : `DIFFERENT pixels ${pixels}, text ${ra.text === rb.text ? 'same' : 'different'}`}`,
          );
          if (!ok && keep) {
            mkdirSync(keep, { recursive: true });
            const file = name.replace(/[^\w-]+/g, '_');
            writeFileSync(path.join(keep, `${file}.ref.png`), ra.png);
            writeFileSync(path.join(keep, `${file}.new.png`), rb.png);
          }
        }
      // An error on one side and not the other is a difference, either way; the same ones on both are not.
      const [ea, eb] = [errors.a.toSorted(), errors.b.toSorted()];
      if (ea.join('\n') !== eb.join('\n')) {
        different++;
        const only = (x: string[], y: string[]) => x.filter((e) => !y.includes(e));
        const [oa, ob] = [only(ea, eb), only(eb, ea)];
        console.log(
          `${label} ${scheme}: errors DIFFERENT: only on the reference ${oa.length} (${hash(oa.join('\n'))}), only on the new side ${ob.length} (${hash(ob.join('\n'))})`,
        );
        if (keep) writeFileSync(path.join(keep, `errors-${label}-${scheme}.txt`), `reference:\n${oa.join('\n')}\nnew:\n${ob.join('\n')}`);
      } else if (eb.length) console.log(`${label} ${scheme}: the same errors on both sides: ${eb.length} (${hash(eb.join('\n'))})`);
      await context.close();
    }
  }
  console.log(`\nthe small screen's search glyph and status line: ${[...glyphs].join('; ') || 'the same'}`);
  console.log(`the glyph checks: allowed ${glyphAllowed} (main's filled glyph to the core's stroked one), different ${glyphDifferent}`);
  allowed += glyphAllowed;
  different += glyphDifferent;
  const out = refused(proxies.calls);
  if (out.lopsided) different++;
  console.log(`\n${out.line}; browser requests off the servers, refused: a ${blocked.a}, b ${blocked.b}`);
  if (blocked.a !== blocked.b) different++;
  console.log(`\npages: ${list.length}, in every look on two screens; same ${same}, allowed ${allowed}, different ${different}`);
  code = different ? 1 : 0;
  console.log(code ? 'DIFFERENT' : 'SAME');
  void readFileSync;
} finally {
  await browser?.close();
  for (const c of children) c.kill('SIGKILL');
  proxies.close();
  ref.remove();
  done();
}
process.exit(code);
