// Markdown with LaTeX maths, sanitised. Mermaid and sequence blocks are left as code and drawn by Markdown.svelte.
// On top of Markdown: ==highlights==, Obsidian-style callouts (> [!idea] Title), images with a title become
// captioned figures, and SVG may animate itself (SMIL), as long as it never animates a link.
//
// Lesson text is untrusted (a tutor can be prompt-injected), so everything is sanitised, and nothing that could
// restyle the page (<style>) or post to the API (forms) gets through. Maths is the exception that keeps it fast:
// KaTeX's output is large and trusted (`trust: false`), so the Markdown is sanitised with a placeholder where each
// formula goes and KaTeX's HTML is put back afterwards. Results are kept by source, so a page rendered again
// (a step revisited, a chat answer streaming in) costs nothing for the parts that didn't change.

import { Marked, type TokenizerAndRendererExtension } from 'marked';
import DOMPurify, { type Config } from 'dompurify';
import { maths } from './maths.svelte.ts';

/** SVG animation (SMIL), which DOMPurify drops unless told otherwise. */
const ANIMATION_TAGS = ['animate', 'animateTransform', 'animateMotion', 'set', 'mpath'];
const ANIMATION_ATTRS = [
  'attributeName',
  'attributeType',
  'begin',
  'dur',
  'end',
  'repeatCount',
  'repeatDur',
  'values',
  'keyTimes',
  'keySplines',
  'calcMode',
  'from',
  'to',
  'by',
  'additive',
  'accumulate',
  'restart',
  'path',
  'rotate',
  'keyPoints',
  'type',
];
/** The same tags as the parser may report them (it can lower-case "animateTransform"), for the hooks. */
const ANIMATING = new Set(ANIMATION_TAGS.map((t) => t.toLowerCase()));
/** Elements that point at another element by href: allowed only to point inside the same drawing. */
const REFERENCING = new Set(['use', 'mpath']);
/** Never in lesson content: <style> could restyle the whole page, and a form could post to the API from here. */
const FORBID_TAGS = ['style', 'form', 'input', 'button', 'textarea', 'select', 'option'];
const FORBID_ATTR = ['action', 'formaction'];

const BLOCK_CONFIG: Config & { RETURN_DOM_FRAGMENT: true } = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
  ADD_TAGS: [...ANIMATION_TAGS, 'use'],
  ADD_ATTR: ['target', ...ANIMATION_ATTRS],
  FORBID_TAGS,
  FORBID_ATTR,
  RETURN_DOM_FRAGMENT: true,
};
const INLINE_CONFIG: Config = { USE_PROFILES: { html: true, svg: true, mathMl: true }, FORBID_TAGS, FORBID_ATTR };

/** Rendered HTML kept by source, most recently used last. */
const CACHE_SIZE = 400;
const cache = new Map<string, string>();

/** Callout kinds: the title used when none is given, and a 16×16 stroked icon. */
const CALLOUTS: Record<string, { label: string; icon: string }> = {
  idea: { label: 'The idea', icon: '<circle cx="8" cy="7" r="4.5"/><path d="M6 13h4M6.5 15h3"/>' },
  key: { label: 'Key point', icon: '<path d="M2 8h8M10 8l-3-3M10 8l-3 3"/><circle cx="12.5" cy="8" r="1.5"/>' },
  why: {
    label: 'Why this matters',
    icon: '<circle cx="8" cy="8" r="6"/><path d="M6.3 6.2a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1M8 11.4v.2"/>',
  },
  context: { label: 'Where we are', icon: '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2"/>' },
  example: { label: 'Example', icon: '<path d="M3 13l3-8 3 5 2-3 2 6"/>' },
  you: { label: 'In your world', icon: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3.5 14c.6-2.6 2.3-4 4.5-4s3.9 1.4 4.5 4"/>' },
  careful: { label: 'Careful', icon: '<path d="M8 2l6.5 12h-13z"/><path d="M8 6.5v3.5M8 12v.2"/>' },
  term: { label: 'Term', icon: '<path d="M3 3h10M8 3v10"/>' },
  note: { label: 'Note', icon: '<path d="M3 2.5h7l3 3v8H3z"/><path d="M5.5 7h5M5.5 9.5h5"/>' },
};
/** Other names for the same kinds, as GitHub and Obsidian spell them. */
const ALIASES: Record<string, string> = {
  tip: 'idea',
  important: 'key',
  warning: 'careful',
  caution: 'careful',
  info: 'note',
  definition: 'term',
  question: 'why',
};

/**
 * The render in progress: KaTeX's output for each formula, by its placeholder number, and whether any formula
 * had to wait for KaTeX (then the result isn't kept). The nonce makes placeholders impossible to forge from the text.
 */
let render: { nonce: string; slots: string[]; waiting: boolean } = { nonce: '', slots: [], waiting: false };

const blockMath: TokenizerAndRendererExtension = {
  name: 'blockMath',
  level: 'block',
  start: (src) => startAt(src.search(/\$\$|\\\[/)),
  tokenizer(src) {
    const m = /^\$\$([\s\S]+?)\$\$[^\S\n]*(?:\n|$)/.exec(src) ?? /^\\\[([\s\S]+?)\\\][^\S\n]*(?:\n|$)/.exec(src);
    if (m) return { type: 'blockMath', raw: m[0], text: m[1].trim() };
  },
  renderer: (token) => `<div class="math-display">${tex(token.text as string, true)}</div>`,
};

const inlineMath: TokenizerAndRendererExtension = {
  name: 'inlineMath',
  level: 'inline',
  start: (src) => startAt(src.search(/\$|\\\(/)),
  tokenizer(src) {
    let m = /^\$\$([\s\S]+?)\$\$/.exec(src);
    if (m) return { type: 'inlineMath', raw: m[0], text: m[1], display: true };
    // $...$ that doesn't start or end with a space and isn't followed by a digit (so "$5 and $10" stays text).
    m = /^\$(?!\s)((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\d)/.exec(src) ?? /^\\\(([\s\S]+?)\\\)/.exec(src);
    if (m) return { type: 'inlineMath', raw: m[0], text: m[1], display: false };
  },
  renderer: (token) => tex(token.text as string, Boolean(token.display)),
};

const highlight: TokenizerAndRendererExtension = {
  name: 'highlight',
  level: 'inline',
  start: (src) => startAt(src.indexOf('==')),
  tokenizer(src) {
    const m = /^==(?!\s)([^=\n]+?)(?<!\s)==/.exec(src);
    if (m) return { type: 'highlight', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
  },
  renderer(token) {
    return `<mark>${this.parser.parseInline(token.tokens ?? [])}</mark>`;
  },
};

/** {{term|definition}}: a term with a short definition, shown in a hover card. */
const term: TokenizerAndRendererExtension = {
  name: 'term',
  level: 'inline',
  start: (src) => startAt(src.indexOf('{{')),
  tokenizer(src) {
    const m = /^\{\{([^{}|]+?)\|([^{}]+?)\}\}/.exec(src);
    if (m) return { type: 'term', raw: m[0], text: m[1].trim(), def: m[2].trim(), tokens: this.lexer.inlineTokens(m[1].trim()) };
  },
  renderer(token) {
    return `<span class="term" tabindex="0" data-def="${escapeHtml(token.def as string)}">${this.parser.parseInline(token.tokens ?? [])}</span>`;
  },
};

/** [[concept-id]], [[topic/concept-id]] or [[...|label]]: a link to a concept, with a hover preview. */
const conceptLink: TokenizerAndRendererExtension = {
  name: 'conceptLink',
  level: 'inline',
  start: (src) => startAt(src.indexOf('[[')),
  tokenizer(src) {
    const m = /^\[\[([^[\]|]+?)(?:\|([^[\]]+?))?\]\]/.exec(src);
    if (m) return { type: 'conceptLink', raw: m[0], ref: m[1].trim(), label: (m[2] ?? '').trim() };
  },
  renderer(token) {
    const label = (token.label as string) || '';
    return `<a class="concept-link" data-concept="${escapeHtml(token.ref as string)}" data-label="${escapeHtml(label)}">${escapeHtml(label || (token.ref as string))}</a>`;
  },
};

const marked = new Marked({
  gfm: true,
  breaks: false,
  extensions: [blockMath, inlineMath, highlight, term, conceptLink],
  renderer: {
    // A task list's box is drawn, not a form control: lesson content carries no inputs.
    checkbox: ({ checked }) => `<span class="task${checked ? ' done' : ''}" role="img" aria-label="${checked ? 'done' : 'to do'}"></span> `,
  },
});

DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  // attrName is already lower-cased; most attributes are neither of these, so the tag is only read when needed.
  const name = data.attrName;
  if (name === 'href' || name === 'xlink:href') {
    // <use> and <mpath> may only reference something in the page ("#id"), never an outside file.
    if (!REFERENCING.has(node.nodeName.toLowerCase())) return;
    if (data.attrValue.trim().startsWith('#')) data.forceKeepAttr = true;
    else data.keepAttr = false;
  } else if (name === 'attributename') {
    // An animation may change how a shape looks, never where a link points or what runs on an event.
    if (!ANIMATING.has(node.nodeName.toLowerCase())) return;
    const target = data.attrValue.toLowerCase();
    if (target.includes('href') || target.startsWith('on')) data.keepAttr = false;
  }
});

// A link that opens elsewhere never hands that page a way back into this one.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if ('hasAttribute' in node && (node as Element).hasAttribute('target')) (node as Element).setAttribute('rel', 'noopener noreferrer');
});

/**
 * A whole piece of lesson Markdown, as safe HTML. `keep: false` for text that is still changing (an answer being
 * written), so its passing states don't push lessons out of the kept results.
 */
export function renderMarkdown(source: string, keep = true): string {
  return cached(
    keep ? `b:${source}` : null,
    () => {
      const scope = hash(source);
      return withMaths(() => {
        const fragment = DOMPurify.sanitize(marked.parse(source, { async: false }), BLOCK_CONFIG);
        enrich(fragment, scope);
        const box = document.createElement('template');
        box.content.append(fragment);
        return box.innerHTML;
      });
    },
    `<p class="render-failed">${escapeHtml(source)}</p>`,
  );
}

/** Inline rendering for short strings such as quiz options (no wrapping paragraph). */
export function renderInline(source: string): string {
  return cached(
    `i:${source}`,
    () => withMaths(() => DOMPurify.sanitize(marked.parseInline(source, { async: false }), INLINE_CONFIG)),
    escapeHtml(source),
  );
}

/**
 * The kept result for `key`, or a fresh one (kept unless it is waiting for KaTeX). If rendering fails, the text is
 * shown as it is rather than break the page.
 */
function cached(key: string | null, make: () => { html: string; complete: boolean }, fallback: string): string {
  const hit = key === null ? undefined : cache.get(key);
  if (key !== null && hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  try {
    const { html, complete } = make();
    if (key !== null && complete) {
      cache.set(key, html);
      if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
    }
    return html;
  } catch (err) {
    console.error('Could not render this Markdown', err);
    return fallback;
  }
}

/** Runs one render: formulas become numbered placeholders, which are filled with KaTeX's HTML after sanitising. */
function withMaths(sanitised: () => string): { html: string; complete: boolean } {
  const mine = { nonce: Math.random().toString(36).slice(2, 10), slots: [] as string[], waiting: false };
  const outer = render;
  render = mine;
  try {
    const clean = sanitised();
    const html = mine.slots.length
      ? clean.replace(/<span data-math-slot="([a-z0-9]+)-(\d+)"><\/span>/g, (m, nonce: string, i: string) =>
          nonce === mine.nonce ? (mine.slots[Number(i)] ?? '') : m,
        )
      : clean;
    return { html, complete: !mine.waiting };
  } finally {
    render = outer;
  }
}

/** A formula: a placeholder for KaTeX's HTML, or its source in a quiet box until KaTeX has loaded. */
function tex(source: string, displayMode: boolean): string {
  const katex = maths.katex;
  if (!katex) {
    // Read in a reactive context, this renders again when KaTeX arrives.
    void maths.version;
    void maths.load();
    render.waiting = true;
    return `<span class="math-pending${displayMode ? ' display' : ''}">${escapeHtml(source)}</span>`;
  }
  const html = katex.renderToString(source, { displayMode, throwOnError: false, output: 'htmlAndMathml', trust: false });
  return `<span data-math-slot="${render.nonce}-${render.slots.push(html) - 1}"></span>`;
}

/**
 * Gives every id inside each drawing a prefix of its own (from the text's hash, so the same text always gets the
 * same ids, kept or not), and points its references (href="#id", url(#id)) at the new names, so two drawings on one
 * page can both use id="path" without clashing.
 */
function scopeIds(root: DocumentFragment, scope: string) {
  let n = 0;
  for (const svg of root.querySelectorAll('svg')) {
    const owned = svg.querySelectorAll('[id]');
    if (owned.length === 0) continue;
    const prefix = `d${scope}-${n++}-`;
    const names = new Set<string>();
    for (const el of owned) {
      names.add(el.id);
      el.id = prefix + el.id;
    }
    const swap = (v: string) =>
      v
        .replace(/^#(.+)$/, (m, id) => (names.has(id) ? `#${prefix}${id}` : m))
        .replace(/url\(#([^)]+)\)/g, (m, id) => (names.has(id) ? `url(#${prefix}${id})` : m));
    for (const el of svg.querySelectorAll('*')) {
      for (const attr of [...el.attributes]) {
        if (attr.value.includes('#')) el.setAttribute(attr.name, swap(attr.value));
      }
    }
  }
}

/**
 * Scopes drawing ids, turns blockquotes that open with [!kind] into callouts, and titled images into captioned
 * figures. Works on the sanitised nodes, moving them, never re-reading HTML.
 */
function enrich(root: DocumentFragment, scope: string) {
  const doc = root.ownerDocument;
  scopeIds(root, scope);
  for (const quote of root.querySelectorAll('blockquote')) callout(quote, doc);
  for (const img of root.querySelectorAll('img[title]')) {
    const p = img.parentElement;
    const figure = doc.createElement('figure');
    const caption = doc.createElement('figcaption');
    caption.textContent = img.getAttribute('title');
    img.removeAttribute('title');
    img.setAttribute('loading', 'lazy');
    if (p?.tagName === 'P' && p.childNodes.length === 1) p.replaceWith(figure);
    else img.replaceWith(figure);
    figure.append(img, caption);
  }
}

/**
 * > [!kind] Title, then the body: the marker and the rest of its line (up to the first line break) become the
 * callout's title, the rest its body.
 */
function callout(quote: Element, doc: Document) {
  const first = quote.firstElementChild;
  const lead = first?.tagName === 'P' ? first.firstChild : null;
  if (!first || lead?.nodeType !== Node.TEXT_NODE) return;
  const m = /^\s*\[!(\w+)\][+-]?[^\S\n]*/.exec(lead.nodeValue ?? '');
  if (!m) return;
  const kind = ALIASES[m[1].toLowerCase()] ?? m[1].toLowerCase();
  const meta = CALLOUTS[kind] ?? CALLOUTS.note;
  lead.nodeValue = (lead.nodeValue ?? '').slice(m[0].length);

  // The title: what follows the marker on its line.
  const title: ChildNode[] = [];
  for (let node = first.firstChild; node; ) {
    const next = node.nextSibling;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue ?? '';
      const end = text.indexOf('\n');
      if (end !== -1) {
        (node as Text).splitText(end).nodeValue = text.slice(end + 1);
        title.push(node);
        break;
      }
    } else if (node.nodeName === 'BR') {
      node.remove();
      break;
    } else if ((node.textContent ?? '').includes('\n')) break;
    title.push(node);
    node = next;
  }
  const head = doc.createElement('p');
  head.className = 'callout-title';
  const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [k, v] of Object.entries({
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.4',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }))
    icon.setAttribute(k, v);
  icon.innerHTML = meta.icon;
  head.append(icon);
  const said = title.some((n) => n.nodeType !== Node.TEXT_NODE || (n.nodeValue ?? '').trim());
  if (said) {
    head.append(...title);
    trimEdges(head);
  } else {
    for (const n of title) n.remove();
    head.append(meta.label);
  }

  const aside = doc.createElement('aside');
  aside.className = `callout ${CALLOUTS[kind] ? kind : 'note'}`;
  const body = doc.createElement('div');
  body.className = 'callout-body';
  if (!(first.textContent ?? '').trim() && !first.querySelector('*')) first.remove();
  body.append(...quote.childNodes);
  aside.append(head, body);
  quote.replaceWith(aside);
}

/** Trims the space left at either end of a title by the marker and the line break. */
function trimEdges(el: Element) {
  const firstText = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
  if (firstText && firstText === el.childNodes[1]) firstText.nodeValue = (firstText.nodeValue ?? '').trimStart();
  const last = el.lastChild;
  if (last?.nodeType === Node.TEXT_NODE) last.nodeValue = (last.nodeValue ?? '').trimEnd();
}

/** A Marked extension's start(): where in the source its syntax might begin, or nowhere. */
function startAt(i: number): number | undefined {
  return i === -1 ? undefined : i;
}

/** A short, stable name for a piece of text (FNV-1a), for the ids in its drawings. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
