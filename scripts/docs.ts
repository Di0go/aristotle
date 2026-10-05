// Keeps the reference parts of the docs true by writing them from the code: the map of files (from each
// file's header comment), the MCP tools, the API routes, the environment variables, the pnpm scripts, the
// skills and agents, and the visual kit. In a doc they sit between markers, and only this script edits them:
//
//   <!-- generated: tools -->
//   ...
//   <!-- /generated -->
//
//   pnpm docs              rewrite every generated block
//   pnpm docs --check      fail if any block is out of date (a gate)
//   pnpm docs --stage      rewrite them and add the changed docs to the commit (the pre-commit hook)
//
// The prose around the blocks is written by hand; tests/docs.test.ts and the Stop hook keep it moving with the code.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
const list = (dir: string, ext: RegExp) =>
  existsSync(path.join(ROOT, dir))
    ? readdirSync(path.join(ROOT, dir))
        .filter((f) => ext.test(f))
        .sort()
        .map((f) => `${dir}/${f}`)
    : [];
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const firstSentence = (s: string) => {
  const m = /^(.+?[.!?])(\s|$)/.exec(s.replace(/\s+/g, ' ').trim());
  return m ? m[1] : s.trim();
};

/** A file's header comment: the comment it opens with (for Svelte, the first one in its script). */
export function header(rel: string): string | undefined {
  let text = read(rel);
  if (rel.endsWith('.svelte')) text = /<script[^>]*>\n([\s\S]*?)<\/script>/.exec(text)?.[1] ?? '';
  const lines = text.split('\n');
  let i = rel.endsWith('.sh') ? 1 : 0; // after the shebang
  while (lines[i] !== undefined && lines[i].trim() === '') i++;
  const out: string[] = [];
  const first = lines[i]?.trim() ?? '';
  if (first.startsWith('/*')) {
    for (; i < lines.length; i++) {
      out.push(lines[i].replace(/^\s*\/?\*+\/?/, '').replace(/\*\/\s*$/, ''));
      if (lines[i].includes('*/')) break;
    }
  } else {
    const mark = first.startsWith('#') ? '#' : '//';
    for (; i < lines.length && lines[i].trim().startsWith(mark); i++) out.push(lines[i].trim().slice(mark.length));
  }
  const joined = out.join(' ').trim();
  return joined ? firstSentence(joined) : undefined;
}

/** The source files the map of files covers, in the order the map shows them. */
export const MAPPED_DIRS: { dir: string; ext: RegExp; title: string }[] = [
  { dir: 'server', ext: /\.ts$/, title: 'Server (`server/`)' },
  { dir: 'shared', ext: /\.ts$/, title: 'Shared types (`shared/`)' },
  { dir: 'ui/src', ext: /\.(ts|svelte)$/, title: 'Interface entry (`ui/src/`)' },
  { dir: 'ui/src/pages', ext: /\.svelte$/, title: 'Pages (`ui/src/pages/`)' },
  { dir: 'ui/src/lib', ext: /\.(ts|svelte)$/, title: 'Components and state (`ui/src/lib/`)' },
  { dir: 'ui/src/lib/kit', ext: /\.svelte$/, title: 'Visual kit (`ui/src/lib/kit/`)' },
  { dir: 'ui/src/lib/charts', ext: /\.(ts|svelte)$/, title: 'Charts (`ui/src/lib/charts/`)' },
  { dir: 'ui/src/lib/explorables', ext: /\.(ts|svelte)$/, title: 'Explorables (`ui/src/lib/explorables/`)' },
  { dir: 'ui/src/styles', ext: /\.css$/, title: 'Styles (`ui/src/styles/`)' },
  { dir: 'scripts', ext: /\.(ts|sh)$/, title: 'Scripts (`scripts/`)' },
  { dir: 'tests', ext: /\.ts$/, title: 'Tests (`tests/`)' },
];

export const mappedFiles = () => MAPPED_DIRS.flatMap((d) => list(d.dir, d.ext));

function files(): string {
  return MAPPED_DIRS.map(({ dir, ext, title }) => {
    const rows = list(dir, ext).map((f) => {
      const h = header(f);
      if (!h) throw new Error(`${f} has no header comment: start it with a comment saying what it is for.`);
      return `| [\`${path.basename(f)}\`](../${f}) | ${cell(h)} |`;
    });
    return rows.length ? `#### ${title}\n\n| File | What it is |\n|---|---|\n${rows.join('\n')}` : '';
  })
    .filter(Boolean)
    .join('\n\n');
}

function routes(): string {
  const src = read('server/index.ts');
  const rows = [...src.matchAll(/req\.method === '(\w+)' && route(?: === |\.startsWith\()'([^']+)'/g)].map(
    ([, method, route]) => `| \`${method}\` | \`${route}${src.includes(`route.startsWith('${route}')`) ? '…' : ''}\` |`,
  );
  return `| Method | Route |\n|---|---|\n${rows.join('\n')}\n| \`GET\` (WebSocket) | \`/api/terminal\` |\n| \`POST\` | \`/mcp\` |`;
}

function env(): string {
  const seen = new Map<string, { where: string; what: string }>();
  for (const f of ['server/config.ts', ...list('scripts', /\.ts$/)]) {
    const lines = read(f).split('\n');
    lines.forEach((line, i) => {
      for (const [, name] of line.matchAll(/process\.env\.(ARISTOTLE_[A-Z_]+)/g)) {
        if (seen.has(name)) continue;
        // The comment just above the declaration that reads it.
        let j = i - 1;
        const comment: string[] = [];
        while (j >= 0 && /^\s*(\/\/|\*|\/\*\*)/.test(lines[j])) comment.unshift(lines[j--]);
        const what = firstSentence(comment.map((l) => l.replace(/^\s*(\/\*\*|\*\/|\*|\/\/)\s?/, '').replace(/\*\/\s*$/, '')).join(' '));
        seen.set(name, { where: f, what: what || '' });
      }
    });
  }
  const rows = [...seen].map(([name, { where, what }]) => `| \`${name}\` | ${cell(what)} | [\`${path.basename(where)}\`](../${where}) |`);
  return `| Variable | What it sets | Read in |\n|---|---|---|\n${rows.join('\n')}`;
}

function scripts(): string {
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  return `| Command | Runs |\n|---|---|\n${Object.entries(pkg.scripts)
    .map(([name, cmd]) => `| \`pnpm ${name}\` | \`${cell(cmd)}\` |`)
    .join('\n')}`;
}

function frontmatter(file: string): Record<string, string> {
  const fm = /^---\n([\s\S]*?)\n---/.exec(read(file))?.[1] ?? '';
  return Object.fromEntries([...fm.matchAll(/^(\w+):\s*(.*)$/gm)].map(([, k, v]) => [k, v.replace(/^["']|["']$/g, '')]));
}

function skills(): string {
  const skillRows = readdirSync(path.join(ROOT, '.claude/skills'))
    .sort()
    .map((s) => {
      const fm = frontmatter(`.claude/skills/${s}/SKILL.md`);
      return `| skill | [\`${fm.name ?? s}\`](../.claude/skills/${s}/SKILL.md) | ${cell(firstSentence(fm.description ?? ''))} |`;
    });
  const agentRows = list('.claude/agents', /\.md$/).map((f) => {
    const fm = frontmatter(f);
    return `| agent | [\`${fm.name ?? path.basename(f, '.md')}\`](../${f}) | ${cell(firstSentence(fm.description ?? ''))} |`;
  });
  return `| Kind | Name | What it is for |\n|---|---|---|\n${[...skillRows, ...agentRows].join('\n')}`;
}

function kit(): string {
  const md = read('ui/src/lib/Markdown.svelte');
  const kitBlock = /const KIT[^{]*\{([\s\S]*?)\n\s*\};/.exec(md)?.[1] ?? '';
  const kitRows = [...kitBlock.matchAll(/(\w+): \(\) => import\('\.\/(kit\/\w+\.svelte)'\)/g)].map(
    ([, lang, file]) =>
      `| \`${lang}\` | [\`${path.basename(file)}\`](../ui/src/lib/${file}) | ${cell(header(`ui/src/lib/${file}`) ?? '')} |`,
  );
  const ex = read('ui/src/lib/explorables/index.ts');
  const exRows = [...ex.matchAll(/id: '([^']+)',\s*title: '([^']+)'/g)].map(([, id, title]) => `| \`${id}\` | ${cell(title)} |`);
  return `Visual kit, a fenced block in the figure's language:\n\n| Language | Component | What it draws |\n|---|---|---|\n${kitRows.join('\n')}\n\nExplorables, a fenced \`explorable\` block with \`{"id": …}\`:\n\n| Id | Title |\n|---|---|\n${exRows.join('\n')}`;
}

async function tools(): Promise<string> {
  // The real MCP server, on an empty data directory, asked for its tools over an in-memory connection.
  const data = mkdtempSync(path.join(tmpdir(), 'aristotle-docs-'));
  process.env.ARISTOTLE_DATA_DIR = data;
  process.env.ARISTOTLE_STATE_DIR = data;
  process.env.ARISTOTLE_BACKUP = 'off';
  try {
    const { Gym } = await import('../server/gym.ts');
    const { createMcpServer } = await import('../server/mcp.ts');
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
    const [a, b] = InMemoryTransport.createLinkedPair();
    const server = createMcpServer(await Gym.load());
    const client = new Client({ name: 'docs', version: '0' });
    await Promise.all([server.connect(a), client.connect(b)]);
    const { tools } = await client.listTools();
    await client.close();
    return `| Tool | What it does |\n|---|---|\n${tools.map((t) => `| \`${t.name}\` | ${cell(firstSentence(t.description ?? ''))} |`).join('\n')}`;
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
}

export const GENERATORS: Record<string, () => string | Promise<string>> = { files, routes, env, scripts, skills, kit, tools };

const BLOCK = /(<!-- generated: (\w+) -->)[\s\S]*?(<!-- \/generated -->)/g;

/** Every doc with generated blocks, rewritten; returns the ones that changed. */
export async function generate(write: boolean): Promise<string[]> {
  const docs = [...list('docs', /\.md$/), 'CONTRIBUTING.md'].filter((f) => existsSync(path.join(ROOT, f)));
  const cache = new Map<string, string>();
  const used = new Set<string>();
  const changed: string[] = [];
  for (const doc of docs) {
    const before = read(doc);
    let after = before;
    for (const [, , name] of before.matchAll(BLOCK)) {
      const gen = GENERATORS[name];
      if (!gen) throw new Error(`${doc}: no generator called "${name}" (scripts/docs.ts)`);
      used.add(name);
      if (!cache.has(name)) cache.set(name, await gen());
    }
    after = before.replace(BLOCK, (_, open: string, name: string, close: string) => `${open}\n${cache.get(name)}\n${close}`);
    if (after !== before) {
      changed.push(doc);
      if (write) writeFileSync(path.join(ROOT, doc), after);
    }
  }
  const unused = Object.keys(GENERATORS).filter((g) => !used.has(g));
  if (unused.length) throw new Error(`Generated blocks used by no doc: ${unused.join(', ')}`);
  return changed;
}

if (import.meta.main) {
  const mode = process.argv[2];
  try {
    const changed = await generate(mode !== '--check');
    if (mode === '--check' && changed.length) {
      console.error(`Generated docs are out of date: ${changed.join(', ')}. Run: pnpm docs`);
      process.exit(1);
    }
    if (mode === '--stage' && changed.length) execFileSync('git', ['add', ...changed], { cwd: ROOT });
    if (mode !== '--check') console.error(changed.length ? `Updated ${changed.join(', ')}` : 'Docs are current.');
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  process.exit(0);
}
