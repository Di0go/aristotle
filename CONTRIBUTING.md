# Contributing

Aristotle is built to be changed by the person who uses it, so the setup for changing it is the same whether you are its author or forked it yesterday.

```sh
pnpm install
pnpm dev        # http://localhost:5173: a dev instance with a demo library, reloaded as you edit
```

Before you start, read [docs/README.md](docs/README.md): it says which doc covers what. The ones you will want first are [development.md](docs/development.md) (instances, gates, releases) and [extending.md](docs/extending.md) (where each kind of change goes).

## The rules

- **Never touch a learner's data by hand.** `data/` is a learning history; the dev instance has its own (`.dev/data`), and `pnpm dev:snapshot` copies the real one when you need it.
- **Every change passes `pnpm gates`**: generated docs, Biome, types, the end-to-end tests and the build. The Git hooks run them on commit (quick ones) and push (all); CI runs them again.
- **Docs change with the code.** Reference tables are generated (`pnpm docs`); the prose next to the code you changed is yours to update. If nothing needs saying, write `Docs: none -- <why>` in the commit message.
- **Every source file starts with a comment saying what it is for.**
- **Match the code around you**: plain TypeScript run directly by Node (erasable syntax only, `.ts` in imports), Svelte 5 runes, design tokens instead of raw colours, comments that say why.
- **Commit messages**: a short summary of what changed for the user, then why if it is not obvious.

## With Claude Code

Open Claude Code in the repository: [CLAUDE.md](CLAUDE.md) tells it the rules above, and its Stop hook sends it back to the docs when it changes code without them. To have it teach in the dev instance, enable the `aristotle-dev` MCP server with `/mcp`.
