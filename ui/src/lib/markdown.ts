// Markdown with LaTeX maths, sanitised. Mermaid and sequence blocks are left as code and drawn by Markdown.svelte.
// On top of Markdown: ==highlights==, Obsidian-style callouts (> [!idea] Title), images with a title become
// captioned figures, and SVG may animate itself (SMIL), as long as it never animates a link.

import { Marked, type TokenizerAndRendererExtension } from 'marked';
import katex from 'katex';
import DOMPurify from 'dompurify';

function tex(source: string, displayMode: boolean): string {
  return katex.renderToString(source, { displayMode, throwOnError: false, output: 'htmlAndMathml' });
}

const blockMath: TokenizerAndRendererExtension = {
  name: 'blockMath',
  level: 'block',
  start: (src) => {
    const i = src.search(/\$\$|\\\[/);
    return i === -1 ? undefined : i;
  },
  tokenizer(src) {
    const m = /^\$\$([\s\S]+?)\$\$[^\S\n]*(?:\n|$)/.exec(src) ?? /^\\\[([\s\S]+?)\\\][^\S\n]*(?:\n|$)/.exec(src);
    if (m) return { type: 'blockMath', raw: m[0], text: m[1].trim() };
  },
  renderer: (token) => `<div class="math-display">${tex(token.text as string, true)}</div>`,
};

const inlineMath: TokenizerAndRendererExtension = {
  name: 'inlineMath',
  level: 'inline',
  start: (src) => {
    const i = src.search(/\$|\\\(/);
    return i === -1 ? undefined : i;
  },
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
  start: (src) => {
    const i = src.indexOf('==');
    return i === -1 ? undefined : i;
  },
  tokenizer(src) {
    const m = /^==(?!\s)([^=\n]+?)(?<!\s)==/.exec(src);
    if (m) return { type: 'highlight', raw: m[0], text: m[1], tokens: this.lexer.inlineTokens(m[1]) };
  },
  renderer(token) {
    return `<mark>${this.parser.parseInline(token.tokens ?? [])}</mark>`;
  },
};

const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** {{term|definition}}: a term with a short definition, shown in a hover card. */
const term: TokenizerAndRendererExtension = {
  name: 'term',
  level: 'inline',
  start: (src) => {
    const i = src.indexOf('{{');
    return i === -1 ? undefined : i;
  },
  tokenizer(src) {
    const m = /^\{\{([^{}|]+?)\|([^{}]+?)\}\}/.exec(src);
    if (m) return { type: 'term', raw: m[0], text: m[1].trim(), def: m[2].trim(), tokens: this.lexer.inlineTokens(m[1].trim()) };
  },
  renderer(token) {
    return `<span class="term" tabindex="0" data-def="${escapeAttr(token.def as string)}">${this.parser.parseInline(token.tokens ?? [])}</span>`;
  },
};

/** [[concept-id]], [[topic/concept-id]] or [[...|label]]: a link to a concept, with a hover preview. */
const conceptLink: TokenizerAndRendererExtension = {
  name: 'conceptLink',
  level: 'inline',
  start: (src) => {
    const i = src.indexOf('[[');
    return i === -1 ? undefined : i;
  },
  tokenizer(src) {
    const m = /^\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/.exec(src);
    if (m) return { type: 'conceptLink', raw: m[0], ref: m[1].trim(), label: (m[2] ?? '').trim() };
  },
  renderer(token) {
    const label = (token.label as string) || '';
    return `<a class="concept-link" data-concept="${escapeAttr(token.ref as string)}" data-label="${escapeAttr(label)}">${escapeAttr(label || (token.ref as string))}</a>`;
  },
};

const marked = new Marked({ gfm: true, breaks: false, extensions: [blockMath, inlineMath, highlight, term, conceptLink] });

const ANIMATION_TAGS = ['animate', 'animateTransform', 'animateMotion', 'set', 'mpath'];
/** Elements that point at another element by href: allowed only to point inside the same drawing. */
const REFERENCING = ['use', 'mpath'];
const ANIMATION_ATTRS = [
  'attributeName', 'attributeType', 'begin', 'dur', 'end', 'repeatCount', 'repeatDur', 'values', 'keyTimes',
  'keySplines', 'calcMode', 'from', 'to', 'by', 'additive', 'accumulate', 'restart', 'path', 'rotate', 'keyPoints', 'type',
];

// <use> and <mpath> may only reference something in the page ("#id"), never an outside file.
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (!REFERENCING.includes(node.nodeName.toLowerCase())) return;
  const name = data.attrName.toLowerCase();
  if ((name === 'href' || name === 'xlink:href') && !data.attrValue.trim().startsWith('#')) data.keepAttr = false;
  else if (name === 'href' || name === 'xlink:href') data.forceKeepAttr = true;
});

// An animation may change how a shape looks, never where a link points.
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (!ANIMATION_TAGS.includes(node.nodeName.toLowerCase()) && !ANIMATION_TAGS.includes(node.nodeName)) return;
  if (data.attrName.toLowerCase() !== 'attributename') return;
  const target = data.attrValue.toLowerCase();
  if (target.includes('href') || target.startsWith('on')) data.keepAttr = false;
});

const CALLOUTS: Record<string, { label: string; icon: string }> = {
  idea: { label: 'The idea', icon: '<circle cx="8" cy="7" r="4.5"/><path d="M6 13h4M6.5 15h3"/>' },
  key: { label: 'Key point', icon: '<path d="M2 8h8M10 8l-3-3M10 8l-3 3"/><circle cx="12.5" cy="8" r="1.5"/>' },
  why: { label: 'Why this matters', icon: '<circle cx="8" cy="8" r="6"/><path d="M6.3 6.2a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1M8 11.4v.2"/>' },
  context: { label: 'Where we are', icon: '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2"/>' },
  example: { label: 'Example', icon: '<path d="M3 13l3-8 3 5 2-3 2 6"/>' },
  you: { label: 'In your world', icon: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3.5 14c.6-2.6 2.3-4 4.5-4s3.9 1.4 4.5 4"/>' },
  careful: { label: 'Careful', icon: '<path d="M8 2l6.5 12h-13z"/><path d="M8 6.5v3.5M8 12v.2"/>' },
  term: { label: 'Term', icon: '<path d="M3 3h10M8 3v10"/>' },
  note: { label: 'Note', icon: '<path d="M3 2.5h7l3 3v8H3z"/><path d="M5.5 7h5M5.5 9.5h5"/>' },
};
const ALIASES: Record<string, string> = { tip: 'idea', important: 'key', warning: 'careful', caution: 'careful', info: 'note', definition: 'term', question: 'why' };

let drawings = 0;

/**
 * Gives every id inside each drawing a prefix of its own, and points its references (href="#id", url(#id))
 * at the new names, so two drawings on one page can both use id="path" without clashing.
 */
function scopeIds(root: DocumentFragment) {
  for (const svg of root.querySelectorAll('svg')) {
    const owned = svg.querySelectorAll('[id]');
    if (owned.length === 0) continue;
    const prefix = `d${++drawings}-`;
    const names = new Set<string>();
    for (const el of owned) {
      names.add(el.id);
      el.id = prefix + el.id;
    }
    const swap = (v: string) =>
      v.replace(/^#(.+)$/, (m, id) => (names.has(id) ? `#${prefix}${id}` : m)).replace(/url\(#([^)]+)\)/g, (m, id) => (names.has(id) ? `url(#${prefix}${id})` : m));
    for (const el of svg.querySelectorAll('*')) {
      for (const attr of [...el.attributes]) {
        if (attr.value.includes('#')) el.setAttribute(attr.name, swap(attr.value));
      }
    }
  }
}

/** Turns blockquotes that open with [!kind] into callouts, and titled images into captioned figures. */
function enrich(html: string): string {
  if (!html.includes('[!') && !html.includes('<img') && !html.includes(' id=')) return html;
  const doc = document.createElement('template');
  doc.innerHTML = html;
  scopeIds(doc.content);
  for (const quote of doc.content.querySelectorAll('blockquote')) {
    const first = quote.firstElementChild;
    const m = first?.tagName === 'P' ? /^\s*\[!(\w+)\][+-]?\s*([^\n]*)\n?/.exec(first.innerHTML) : null;
    if (!first || !m) continue;
    const kind = ALIASES[m[1].toLowerCase()] ?? m[1].toLowerCase();
    const meta = CALLOUTS[kind] ?? CALLOUTS.note;
    first.innerHTML = first.innerHTML.slice(m[0].length);
    const aside = document.createElement('aside');
    aside.className = `callout ${CALLOUTS[kind] ? kind : 'note'}`;
    aside.innerHTML =
      `<p class="callout-title"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${meta.icon}</svg>${m[2].trim() || meta.label}</p>` +
      `<div class="callout-body"></div>`;
    const body = aside.querySelector('.callout-body')!;
    if (!first.innerHTML.trim()) first.remove();
    body.append(...quote.childNodes);
    quote.replaceWith(aside);
  }
  for (const img of doc.content.querySelectorAll('img[title]')) {
    const p = img.parentElement;
    const figure = document.createElement('figure');
    const caption = document.createElement('figcaption');
    caption.textContent = img.getAttribute('title');
    img.removeAttribute('title');
    img.setAttribute('loading', 'lazy');
    figure.append(img.cloneNode(), caption);
    if (p?.tagName === 'P' && p.childNodes.length === 1) p.replaceWith(figure);
    else img.replaceWith(figure);
  }
  return doc.innerHTML;
}

export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false });
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
    ADD_TAGS: [...ANIMATION_TAGS, 'use'],
    ADD_ATTR: ['target', ...ANIMATION_ATTRS],
  });
  return enrich(clean);
}

/** Inline rendering for short strings such as quiz options (no wrapping paragraph). */
export function renderInline(source: string): string {
  const html = marked.parseInline(source, { async: false });
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true, svg: true, mathMl: true } });
}
