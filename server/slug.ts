// Turns titles into the stable kebab-case ids used for topics, roadmaps, missions, glosses, chats and file names.
// Letters of any script are kept ("Ἀρετή" -> "αρετη", "日本語の文法" stays), so titles in Greek or Japanese no longer
// all become "untitled" and merge into one. Ids made before that (letters outside a-z dropped) are still found:
// lookups try slugCandidates().

/** "Café au lait!" -> "cafe-au-lait": accents dropped, letters and digits of any script kept, at most 48 characters. */
export function slugify(s: string): string {
  return (
    fold(s)
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'untitled'
  );
}

/** The id `s` had before slugs kept other scripts: letters outside a-z dropped. */
export function legacySlugify(s: string): string {
  return (
    fold(s)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'untitled'
  );
}

/** The ids `s` may be stored under, newest form first: an existing record made before Unicode slugs is still found. */
export function slugCandidates(s: string): string[] {
  const now = slugify(s);
  const before = legacySlugify(s);
  // "untitled" was every title in another script: never a match for one of them.
  return before === now || before === 'untitled' ? [now] : [now, before];
}

/** Lower case, without the accents NFKD splits off Latin, Greek and Cyrillic letters. */
function fold(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
