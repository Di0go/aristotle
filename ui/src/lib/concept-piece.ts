// The one piece of Aristotle's own Markdown that may hold a "|": a [[concept|label]] link. The core keeps it whole inside
// a table cell when it is handed this pattern (createMarkdown's tablePieces, markdown.ts); its own test proves the
// escaping with this very pattern, and tests/unit.test.ts checks the pattern here.

/** [[concept-id]], [[topic/concept-id]] or [[...|label]], on one line. */
export const CONCEPT_PIECE = /\[\[[^[\]\n]*\]\]/;
