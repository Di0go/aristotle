// Markdown with LaTeX maths, sanitised. Mermaid blocks are left as code and drawn by Markdown.svelte.

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

const marked = new Marked({ gfm: true, breaks: false, extensions: [blockMath, inlineMath] });

export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false });
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
    ADD_ATTR: ['target'],
  });
}

/** Inline rendering for short strings such as quiz options (no wrapping paragraph). */
export function renderInline(source: string): string {
  const html = marked.parseInline(source, { async: false });
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true, svg: true, mathMl: true } });
}
