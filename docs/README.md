# Aristotle's docs

For anyone changing Aristotle, including Claude Code. The project [README](../README.md) is for people using it.

| Doc | Read it when you want to |
|---|---|
| [development.md](development.md) | set up, run the dev instance, run the gates, release to the app you use, or learn how these docs keep themselves current |
| [architecture.md](architecture.md) | understand how the pieces fit: Claude Code, the bridge, the server, the interface, and the map of every file |
| [data.md](data.md) | read or change what is stored in `data/`: topics, session logs, roadmaps, missions, and the backup |
| [interface.md](interface.md) | change how it looks or behaves: tokens, themes, layout, pages, and the Markdown a lesson can use |
| [extending.md](extending.md) | add something: an MCP tool, an API route, a page, a figure for the visual kit, an explorable, a setting, a skill |
| [teaching.md](teaching.md) | change the method: how the skills, the subagents and the MCP tools teach together |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | send a change |

## How these docs stay true

- **Reference tables are generated** from the code by `pnpm docs` (between `<!-- generated: … -->` markers, never edited by hand). The pre-commit hook regenerates them and adds them to the commit; `pnpm gates` fails if one is stale.
- **The prose moves with the code.** Each area of code has docs that describe it ([`scripts/doc-zones.ts`](../scripts/doc-zones.ts)). When Claude Code changes an area without touching its docs, its Stop hook sends it back to update them. Before a release, `tests/docs.test.ts` checks the same thing for every commit not yet live. When nothing needs saying, the commit says so: `Docs: none -- <why>`.
- **Every source file opens with a comment saying what it is for**; the map of files in [architecture.md](architecture.md) is built from those comments.
