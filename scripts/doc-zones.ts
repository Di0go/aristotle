// Which docs describe which code: a change to a zone should come with a change to at least one of its docs.
// Read by tests/docs.test.ts (for commits not yet released) and by the Claude Code Stop hook (for the work
// in progress), so the prose moves with the code without anyone having to remember.

export const ZONES: { name: string; code: RegExp; docs: string[] }[] = [
  {
    name: 'data format',
    code: /^(shared\/types\.ts|server\/(topics|feed|roadmaps|missions|reviews|backup)\.ts)$/,
    docs: ['docs/data.md'],
  },
  { name: 'server', code: /^server\//, docs: ['docs/architecture.md', 'docs/extending.md', 'docs/data.md'] },
  { name: 'interface', code: /^ui\//, docs: ['docs/architecture.md', 'docs/extending.md', 'docs/interface.md'] },
  {
    name: 'tooling',
    code: /^(scripts\/|\.githooks\/|\.github\/|package\.json$|biome\.json$|vite\.config\.ts$|tsconfig\.json$|\.mcp\.json$|tests\/)/,
    docs: ['docs/development.md', 'CONTRIBUTING.md'],
  },
  { name: 'teaching', code: /^\.claude\/(skills|agents)\//, docs: ['docs/teaching.md', 'CLAUDE.md'] },
];

/** The exception, written in a commit message: "Docs: none -- <why>". */
export const NO_DOCS = /^Docs: none\b/m;

/** Commits that need no docs whatever they touch: Dependabot's, which only move a pinned version. */
export const NO_DOCS_AUTHOR = /dependabot\[bot\]/;

/** The zones that changed without any of their docs changing. */
export function undocumented(changed: string[]): { name: string; files: string[]; docs: string[] }[] {
  const out = [];
  for (const zone of ZONES) {
    const files = changed.filter((f) => zone.code.test(f));
    if (files.length && !zone.docs.some((d) => changed.includes(d))) out.push({ name: zone.name, files, docs: zone.docs });
  }
  return out;
}
