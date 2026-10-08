// The web, for Aristotle's own tutor on a model API (tutor-api.ts), which has no search of its own: `web_search` (DuckDuckGo's
// plain HTML results, or Wikipedia's search when that fails) and `read_page` (a page as plain text). Accuracy comes
// first in teaching, so the tutor checks facts with these. Only public addresses are fetched: never this machine or
// the local network, so a page can't steer the tutor into Aristotle's own API or a router.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export class WebError extends Error {}

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Aristotle-tutor';
const TIMEOUT_MS = 20_000;
const MAX_BYTES = 3 * 1024 * 1024;
/** What read_page returns at once; `offset` reads on. */
export const PAGE_CHARS = 12_000;

/** Up to `limit` results: DuckDuckGo first, Wikipedia when it gives nothing (it sometimes refuses robots). */
export async function webSearch(query: string, limit = 8): Promise<{ results: SearchResult[]; source: string }> {
  const q = query.trim().slice(0, 300);
  if (!q) throw new WebError('Search for something');
  try {
    const results = await duckDuckGo(q, limit);
    if (results.length) return { results, source: 'DuckDuckGo' };
  } catch {
    // Fall through to Wikipedia.
  }
  return { results: await wikipedia(q, limit), source: 'Wikipedia' };
}

async function duckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new WebError(`DuckDuckGo answered ${res.status}`);
  const html = await res.text();
  const results: SearchResult[] = [];
  const blocks = html.split(/<div[^>]+class="[^"]*\bresult\b[^"]*"/).slice(1);
  for (const block of blocks) {
    const link = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    if (!link?.[1]) continue;
    const snippet = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(a|div|span)>/.exec(block)?.[1] ?? '';
    const url = realUrl(decodeEntities(link[1]));
    if (!url || /duckduckgo\.com\/y\.js|ad_domain=/.test(url)) continue;
    results.push({ title: plain(link[2] ?? ''), url, snippet: plain(snippet) });
    if (results.length >= limit) break;
  }
  return results;
}

/** DuckDuckGo wraps each link in its own redirect (//duckduckgo.com/l/?uddg=…). */
function realUrl(href: string): string {
  try {
    const url = new URL(href, 'https://duckduckgo.com');
    const target = url.searchParams.get('uddg');
    return target ?? url.toString();
  } catch {
    return '';
  }
}

async function wikipedia(query: string, limit: number): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: String(limit),
    format: 'json',
    origin: '*',
  });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new WebError(`Wikipedia answered ${res.status}`);
  const body = (await res.json()) as { query?: { search?: { title: string; snippet: string }[] } };
  return (body.query?.search ?? []).map((r) => ({
    title: r.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
    snippet: plain(r.snippet),
  }));
}

/** A page as plain text, from `offset` on: its title, then its readable text, without scripts, menus or styling. */
export async function readPage(address: string, offset = 0): Promise<{ title: string; text: string; total: number; url: string }> {
  let url = await publicUrl(address);
  let res: Response | undefined;
  // Redirects are followed by hand, so every hop is checked to be public too.
  for (let hop = 0; hop < 5; hop++) {
    res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html, text/plain, application/json;q=0.9, */*;q=0.5' },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const next = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && next) {
      url = await publicUrl(new URL(next, url).toString());
      continue;
    }
    break;
  }
  if (!res) throw new WebError('No answer');
  if (!res.ok) throw new WebError(`The page answered ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (/pdf|image|audio|video|octet-stream|zip/.test(type)) throw new WebError(`It is not a page of text (${type.split(';')[0]})`);
  const raw = await limitedText(res);
  const html = /html|xml/.test(type) || /^\s*</.test(raw);
  const title = html ? plain(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw)?.[1] ?? '') : '';
  const text = html ? pageText(raw) : raw.replace(/\r\n?/g, '\n');
  return { title, text: text.slice(offset, offset + PAGE_CHARS), total: text.length, url };
}

async function limitedText(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    chunks.push(value);
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** The address, if it is http(s) and every address its name resolves to is public. */
async function publicUrl(address: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    throw new WebError('Not a URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new WebError('Only http and https pages');
  if (url.username || url.password) throw new WebError('No credentials in the address');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addresses.length) throw new WebError(`No such host: ${host}`);
  if (addresses.some((a) => !isPublic(a))) throw new WebError('Only public pages: not this machine or the local network');
  return url.toString();
}

/** Not loopback, private, link-local, carrier-grade NAT, multicast or reserved. */
export function isPublic(address: string): boolean {
  const v4 = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (isIP(v4) === 4) {
    const [a = 0, b = 0] = v4.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || b === 0)) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  const v6 = address.toLowerCase();
  if (v6 === '::' || v6 === '::1') return false;
  if (/^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6)) return false;
  return true;
}

/** Readable text from HTML: the main content when the page marks it, without scripts, styles, menus or footers. */
function pageText(html: string): string {
  let body = html.replace(/<!--[\s\S]*?-->/g, '');
  const main = /<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(body)?.[2];
  if (main && main.length > 500) body = main;
  body = body
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|template|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(h[1-6])\b[^>]*>/gi, '\n\n## ')
    .replace(/<(li)\b[^>]*>/gi, '\n- ')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|section|h[1-6]|li|tr|table|blockquote|pre|ul|ol|dd|dt)>/gi, '\n')
    .replace(/<(td|th)\b[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(body)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function plain(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    mdash: '—',
    ndash: '–',
    hellip: '…',
  };
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1]?.toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return named[code.toLowerCase()] ?? m;
  });
}
