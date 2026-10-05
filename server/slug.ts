// Turns titles into the stable kebab-case ids used for topics, roadmaps, missions and file names.

/** "Café au lait!" -> "cafe-au-lait": accents dropped, at most 48 characters, never empty. */
export function slugify(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '') // the accents NFKD split off their letters
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'untitled'
  );
}
