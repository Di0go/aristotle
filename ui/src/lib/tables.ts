// Pipes inside a table row that aren't cell borders: {{term|definition}}, [[concept|label]], $|x|$ and `a|b` all hold
// a "|", and a GFM table splits its rows on every unescaped one, cutting the term in half ("{{non-polar covalent"
// in one cell, the rest of the row shifted). GFM's answer is to escape them (\|), which the table then turns back
// into "|" inside the cell, so the term, link or formula reaches its own parser whole.

/** The row under a table's header: | --- | :-: | ---: | (with a "|", so a setext heading's --- is not one). */
const DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
/** The pieces of a row that may hold a "|" of their own (inline maths as the maths tokenizer reads it). */
const PIECES = /\{\{[^{}\n]*\}\}|\[\[[^[\]\n]*\]\]|`[^`\n]*`|\$(?!\s)(?:\\.|[^\\$\n])+?(?<!\s)\$(?!\d)/g;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/** The source with every "|" inside a table cell's terms, links, maths and code escaped; the rest as it was. */
export function escapeTablePipes(source: string): string {
  if (!source.includes('|')) return source;
  const lines = source.split('\n');
  let fence = '';
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opened = FENCE.exec(line)?.[1];
    if (fence) {
      if (opened && opened[0] === fence[0] && opened.length >= fence.length) fence = '';
      continue;
    }
    if (opened) {
      fence = opened;
      inTable = false;
      continue;
    }
    if (!line.trim()) inTable = false;
    else if (!inTable && line.includes('|') && DELIMITER.test(lines[i + 1] ?? '') && lines[i + 1].includes('|')) {
      inTable = true;
    }
    if (inTable) lines[i] = line.replace(PIECES, (piece) => piece.replace(/(?<!\\)\|/g, '\\|'));
  }
  return lines.join('\n');
}
