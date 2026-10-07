---
paths:
  - "server/**"
  - "ui/**"
  - "shared/**"
  - "scripts/**"
  - "tests/**"
  - "docs/**"
  - ".claude/agents/**"
  - ".claude/rules/**"
  - ".claude/settings.json"
  - ".githooks/**"
  - ".github/**"
  - "package.json"
  - "*.json"
  - "*.config.*"
---

<!-- How to work on Aristotle's code. Kept out of CLAUDE.md so lessons (which never touch the code) don't carry it. -->

# Working on the app

Read [docs/README.md](../../docs/README.md) first: it says which doc covers what. [docs/development.md](../../docs/development.md) is the workflow, [docs/extending.md](../../docs/extending.md) where each kind of change goes, [docs/architecture.md](../../docs/architecture.md) the map of every file.

- **Two apps, never mixed.** The live app the learner uses runs from the release copy (`~/.local/share/aristotle/app`, systemd), on `data/`. You change this checkout and try it in the **dev instance**: `pnpm dev` (http://localhost:5173, its own data in `.dev/data`, reloads on save). Never restart, rebuild or experiment on the live app to test a change; ship it with `pnpm release` once it is committed, and only when asked.
- To try a tool or skill end to end, use the `aristotle-dev` MCP server (off by default), never `aristotle`. `pnpm seed --force` resets the demo data; `pnpm dev:snapshot` copies the real data into dev.
- **`data/` is the learning history.** Never delete, rewrite or commit it; it is its own Git repository, changed only through the server (formats in [docs/data.md](../../docs/data.md)).
- **Docs move with the code.** When you change an area, update the prose in its doc ([scripts/doc-zones.ts](../../scripts/doc-zones.ts)); the Stop hook will send you back if you don't. Reference tables are generated (`pnpm docs:gen`), never edited by hand. Every new source file starts with a comment saying what it is for.
- **Done means `pnpm gates` passes** (docs, Biome, types, end-to-end tests, build). Look at UI changes in the dev instance, in both themes.
- Security lines that must hold: the server listens on loopback only and refuses other users' connections, checks the exact Host and Origin (no other port on this machine is trusted), sends its CSP and no-framing headers, and the terminal WebSocket only ever accepts Aristotle's own Origin.
