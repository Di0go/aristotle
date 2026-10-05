// Real images for lessons, from Wikimedia Commons, with their licences checked before Claude may use them.
// find: search Commons and keep only files whose licence allows reuse (public domain, CC0, CC BY, CC BY-SA),
// with the author and licence to credit. view: fetch one and draw a percentage grid over it, so markers
// on a plate can be placed where the structures really are.

import { execFile } from 'node:child_process';

const API = 'https://commons.wikimedia.org/w/api.php';
// Wikimedia asks every client for a descriptive User-Agent (Policy:User-Agent_policy).
const UA = 'Aristotle/0.3 (personal learning app; https://github.com/Di0go/aristotle) node-fetch';
const IMAGE_HOSTS = ['upload.wikimedia.org'];

export interface FoundImage {
  title: string;
  page: string;
  /** A 1200px-wide rendition, safe to hotlink. */
  src: string;
  width: number;
  height: number;
  license: string;
  licenseUrl?: string;
  artist: string;
  /** The credit line to show under the image. */
  credit: string;
}

interface Meta {
  value?: string;
}

const strip = (html = '') =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Licences an app may reuse with credit. NC/ND and anything unknown are refused. */
export function allowed(license: string, restrictions = ''): boolean {
  const l = license.toLowerCase();
  if (!l || restrictions.trim()) return false;
  if (/\bnc\b|non-?commercial|\bnd\b|no ?deriv|fair use|all rights reserved|copyrighted free use/.test(l)) return false;
  return /public domain|^pd\b|^pd-|cc0|cc[ -]by(?![ -]n)|cc[ -]by[ -]sa|attribution/.test(l);
}

export async function findImages(query: string, limit = 8): Promise<{ images: FoundImage[]; rejected: number }> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap|drawing`,
    gsrnamespace: '6',
    gsrlimit: String(Math.min(30, limit * 3)),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1200',
  });
  const res = await fetch(`${API}?${params}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Wikimedia Commons answered ${res.status}`);
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { title: string; index?: number; imageinfo?: Array<Record<string, unknown>> }> };
  };
  const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const images: FoundImage[] = [];
  let rejected = 0;
  for (const p of pages) {
    const info = p.imageinfo?.[0] as
      | { thumburl?: string; url?: string; descriptionurl?: string; thumbwidth?: number; thumbheight?: number; mime?: string; extmetadata?: Record<string, Meta> }
      | undefined;
    if (!info || !/^image\/(jpeg|png|svg\+xml|gif|webp)$/.test(info.mime ?? '')) continue;
    const m = info.extmetadata ?? {};
    const license = strip(m.LicenseShortName?.value);
    if (!allowed(license, strip(m.Restrictions?.value))) {
      rejected++;
      continue;
    }
    const artist = strip(m.Artist?.value) || 'Unknown author';
    images.push({
      title: p.title.replace(/^File:/, ''),
      page: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
      // Without Commons' tracking parameters.
      src: (info.thumburl ?? info.url ?? '').split('?')[0],
      width: info.thumbwidth ?? 0,
      height: info.thumbheight ?? 0,
      license,
      licenseUrl: strip(m.LicenseUrl?.value) || undefined,
      artist,
      credit: `${artist}, ${license}, via Wikimedia Commons`,
    });
    if (images.length >= limit) break;
  }
  return { images, rejected };
}

/** Fetches an image from Commons' file host and returns it as PNG with a labelled 10% grid drawn over it. */
export async function viewImage(src: string, width = 0, height = 0): Promise<Buffer> {
  const url = new URL(src);
  if (url.protocol !== 'https:' || !IMAGE_HOSTS.includes(url.hostname)) {
    throw new Error(`Only images from ${IMAGE_HOSTS.join(', ')} can be viewed (use a src from find_images).`);
  }
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`The image host answered ${res.status}`);
  const type = res.headers.get('content-type') ?? 'image/jpeg';
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > 15 * 1024 * 1024) throw new Error('The image is too large to view.');
  const W = 1000;
  const H = width > 0 && height > 0 ? Math.round((W * height) / width) : W;
  // The grid is drawn in percent of the image's own box, the same units the plate's markers use.
  const lines: string[] = [];
  for (let i = 1; i < 10; i++) {
    const p = i * 10;
    lines.push(
      `<line x1="${p}%" y1="0" x2="${p}%" y2="100%"/>`,
      `<line x1="0" y1="${p}%" x2="100%" y2="${p}%"/>`,
      `<text x="${p}%" y="14" dx="2">${p}</text>`,
      `<text x="2" y="${p}%" dy="-2">${p}</text>`,
    );
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" preserveAspectRatio="none">
    <image width="100%" height="100%" preserveAspectRatio="none" xlink:href="data:${type};base64,${bytes.toString('base64')}"/>
    <g stroke="#ff2d55" stroke-opacity="0.55" stroke-width="1" fill="#ff2d55" font-family="sans-serif" font-size="12" font-weight="700">${lines.join('')}</g>
  </svg>`;
  return new Promise((resolve, reject) => {
    const child = execFile('rsvg-convert', ['--format', 'png'], { encoding: 'buffer', maxBuffer: 40 * 1024 * 1024, timeout: 20_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim()));
      else resolve(stdout);
    });
    child.stdin?.end(svg);
  });
}
