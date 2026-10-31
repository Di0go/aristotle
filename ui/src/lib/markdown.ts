// Markdown as Aristotle writes it: the core's renderer (@organon/core/ui/markdown: LaTeX maths, sanitised, ==highlights==,
// {{term|definition}}, callouts, captioned figures, SVG that may animate, tables whose cells keep their own "|"; mermaid
// and sequence blocks left as code for Markdown.svelte), with Aristotle's own syntax: [[concept]] links to the map,
// kept whole inside a table cell. Lesson text is untrusted (a tutor can be prompt-injected): the core sanitises it.

import { createMarkdown, escapeHtml, startAt, type TokenizerAndRendererExtension } from '@organon/core/ui/markdown';
import { CONCEPT_PIECE } from './concept-piece.ts';

/** [[concept-id]], [[topic/concept-id]] or [[...|label]]: a link to a concept, with a hover preview. */
const conceptLink: TokenizerAndRendererExtension = {
  name: 'conceptLink',
  level: 'inline',
  start: (src) => startAt(src.indexOf('[[')),
  tokenizer(src) {
    const m = /^\[\[([^[\]|]+?)(?:\|([^[\]]+?))?\]\]/.exec(src);
    if (m) return { type: 'conceptLink', raw: m[0], ref: (m[1] ?? '').trim(), label: (m[2] ?? '').trim() };
  },
  renderer(token) {
    const label = (token.label as string) || '';
    return `<a class="concept-link" data-concept="${escapeHtml(token.ref as string)}" data-label="${escapeHtml(label)}">${escapeHtml(label || (token.ref as string))}</a>`;
  },
};

export const { renderMarkdown, renderInline } = createMarkdown({ extensions: [conceptLink], tablePieces: [CONCEPT_PIECE] });
