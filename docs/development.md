# Development

Aristotle is meant to be changed by the person using it: you notice something while learning, change it, try it, and ship it to yourself. This page is how to do that without ever breaking the app you are learning in.

## Setup

You need Node.js 24 or newer (`.nvmrc`), [pnpm](https://pnpm.io) and [Claude Code](https://claude.com/claude-code). The tests also need `rsvg-convert` (librsvg), which `preview_svg` and `view_image` use to render images (`rsvgConvert` in [`server/images.ts`](../server/images.ts)).

```sh
pnpm install     # also points Git at .githooks/ (the gates run on commit and push)
pnpm dev         # the dev instance, with a demo library
```

Open http://localhost:5173. The status line says **DEV** and the tab title starts with `[dev]`, so you can always tell it from the real one.

## Three instances, never mixed

| | Live | Dev | Test |
|---|---|---|---|
| What for | learning | changing the app | `pnpm test` |
| Started by | systemd (`aristotle.service`) or the bridge | `pnpm dev` | each test run |
| Address | https://aristotle.test, http://localhost:4747 | http://localhost:5173 (Vite) → 4757 | 4799 |
| Code | the release copy (below), or this checkout | this checkout, reloaded on save | this checkout |
| Data | `data/` (your learning history) | `.dev/data/` (disposable) | a temporary folder |
| State | `.aristotle/` (certificate, settings, log) | `.dev/state/` | a temporary folder |
| Backup, TLS, systemd | yes | no | no |

The instance is chosen by `ARISTOTLE_INSTANCE` (`live` unless set to `dev`) and every path and port can be overridden; see [settings](#settings).

### The dev instance

`pnpm dev` runs the server under `node --watch` (it restarts when server code changes) and Vite in front of it (the interface reloads in place). Vite forwards `/api`, the event stream, the terminal's WebSocket and `/mcp` to the dev server, so everything works as in the real app, including Claude Code in the drawer.

Its data starts as the **demo library** ([`scripts/fixtures/demo.ts`](../scripts/fixtures/demo.ts)): a roadmap, a lesson with a quiz and a written answer, a map and a mission. It is replayed through the same MCP tools Claude Code uses, so it is always valid data.

- `pnpm seed --force` resets `.dev/data` to the demo (stop `pnpm dev` first). `pnpm seed <name>` loads another fixture from `scripts/fixtures/`.
- `pnpm dev:snapshot` replaces `.dev/data` with a copy of your real `data/` (without its Git history), to try a change on your real lessons. The copy is disposable; your `data/` is only read.

To have Claude Code teach in the dev instance, to try a new tool or skill end to end, enable the **`aristotle-dev`** MCP server (`/mcp` in Claude Code; it is off by default so lessons never land there by mistake).

### The live app and releases

The app you learn in should not change while you are editing code. So it runs from a **release copy**: a Git worktree of this repository at `~/.local/share/aristotle/app` (`ARISTOTLE_RELEASE_DIR`), checked out at the last commit you released. Its data and state stay here, in `data/` and `.aristotle/`.

```sh
pnpm release              # gates, then build the release copy at HEAD and restart the service on it
pnpm release --rollback   # back to the release before
git log live..            # what is committed but not released yet
```

`pnpm release` refuses uncommitted changes, runs every gate, checks out HEAD in the release copy, installs and builds there, rewrites `aristotle.service` to run it ([`scripts/install-service.sh`](../scripts/install-service.sh)) and checks that the server answers from the new copy. If it does not, the previous release is put back. The tag `live` marks what is running and `live-previous` what ran before.

Without the release copy (a fresh clone, no service) everything runs from this checkout: `pnpm start` builds the interface and restarts the server, and `pnpm app status|start|stop|restart` controls it. Once the live app runs from the release copy, `pnpm start` refuses and points to `pnpm release`.

Claude Code in the drawer runs in the release copy, so lessons use the released skills too. Its `data` is a link to your real `data/`.

## The daily loop

1. Learn in the live app. When something gets in the way, note it (or tell Claude in the drawer).
2. Open Claude Code in this folder and change it. `pnpm dev` shows the change as you make it; `pnpm dev:snapshot` if you need your real lessons to see it.
3. Commit. The pre-commit hook regenerates the reference docs and runs the quick gates.
4. `pnpm release`.

## Gates

`pnpm gates` runs every check, cheapest first: generated docs current, lint and format (Biome, and Prettier for `.svelte`), types, the build, then the tests (which serve the built pages). The same list runs:

- on **commit**, quick ones only (`pnpm gates --quick`, [`.githooks/pre-commit`](../.githooks/pre-commit));
- on **push** ([`.githooks/pre-push`](../.githooks/pre-push));
- in **CI** ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)), with a read-only token, no credentials left on disk, and actions pinned to commits that [Dependabot](../.github/dependabot.yml) proposes updates to;
- before every **release**.

The single commands: `pnpm lint` (read only: Biome lints and checks the formatting of TypeScript, CSS and JSON, Prettier the formatting of `.svelte` files), `pnpm format` (apply both), `pnpm check` (types, through `svelte-check`, which also type-checks and lints the `.svelte` files), `pnpm test`, `pnpm build`.

`pnpm test` is end to end ([`tests/mcp.test.ts`](../tests/mcp.test.ts)): a real server on a throwaway data folder, a real MCP client in Claude Code's place, HTTP calls in the interface's place, a shell in the terminal's place. [`tests/docs.test.ts`](../tests/docs.test.ts) checks the docs.

`pnpm serve` runs the server in the foreground, for debugging it on its own.

## Docs

`pnpm docs:gen` rewrites the generated parts of these docs from the code (see [docs/README.md](README.md#how-these-docs-stay-true)). You rarely run it by hand: the pre-commit hook and the Claude Code Stop hook do.

## Commands

<!-- generated: scripts -->
| Command | Runs |
|---|---|
| `pnpm dev` | `node scripts/dev.ts` |
| `pnpm dev:snapshot` | `node scripts/dev.ts snapshot` |
| `pnpm seed` | `node scripts/seed.ts` |
| `pnpm start` | `node server/control.ts restart --build` |
| `pnpm app` | `node server/control.ts` |
| `pnpm serve` | `node server/index.ts` |
| `pnpm build` | `vite build` |
| `pnpm check` | `svelte-check --tsconfig ./tsconfig.json --fail-on-warnings` |
| `pnpm lint` | `biome check . && prettier --check "ui/src/**/*.svelte"` |
| `pnpm format` | `biome check --write . && prettier --write --log-level warn "ui/src/**/*.svelte"` |
| `pnpm test` | `node --test 'tests/*.test.ts'` |
| `pnpm docs:gen` | `node scripts/docs.ts` |
| `pnpm gates` | `node scripts/gates.ts` |
| `pnpm release` | `node scripts/release.ts` |
| `pnpm prepare` | `git config core.hooksPath .githooks \|\| true` |
<!-- /generated -->

## Settings

Every setting is an environment variable with a default. `.env` is not read: set them in the shell, in the service, or in the script that starts the server.

<!-- generated: env -->
| Variable | What it sets | Read in |
|---|---|---|
| `ARISTOTLE_INSTANCE` | Which instance this is. | [`config.ts`](../server/config.ts) |
| `ARISTOTLE_DATA_DIR` | Where this instance keeps its learning history: plain files, its own Git repository (server/backup.ts). | [`config.ts`](../server/config.ts) |
| `ARISTOTLE_STATE_DIR` | Where this install keeps what isn't learning: certificate, settings, pid files, log. | [`config.ts`](../server/config.ts) |
| `ARISTOTLE_PORT` | The HTTP port: 4747 live, 4757 dev. | [`config.ts`](../server/config.ts) |
| `ARISTOTLE_HOSTNAME` | The clean name (the address it shows and tls.sh's certificate). | [`config.ts`](../server/config.ts) |
| `ARISTOTLE_TLS_DIR` | HTTPS for the clean name: a certificate from scripts/tls.sh, served on its own port that 443 is forwarded to. | [`config.ts`](../server/config.ts) |
| `ARISTOTLE_TLS_PORT` | The HTTPS port, which the clean name's port 443 is forwarded to. | [`config.ts`](../server/config.ts) |
| `ARISTOTLE_SETTINGS` | This install's own choices, kept out of git: settings.json in the state directory (for example {"accent": "red"}). | [`config.ts`](../server/config.ts) |
| `ARISTOTLE_VITE_PORT` | The Vite dev server's port (vite.config.ts), which proxies to this server in dev. | [`config.ts`](../server/config.ts) |
| `ARISTOTLE_BACKUP` | Commit data/ after quiet periods (server/backup.ts). | [`config.ts`](../server/config.ts) |
| `ARISTOTLE_CLAUDE_CMD` | The command the terminal drawer runs (server/terminal.ts); tests swap in a shell. | [`config.ts`](../server/config.ts) |
| `ARISTOTLE_ONESHOT_MODEL` | The model for glosses and his questions on a passage (server/oneshot.ts): an alias Claude Code knows, on his own login. | [`config.ts`](../server/config.ts) |
| `ARISTOTLE_GLOSS_IMAGES` | Whether a gloss may carry a picture from Wikimedia Commons, when one would help (off in the tests: no network). | [`config.ts`](../server/config.ts) |
| `ARISTOTLE_ONESHOT_CMD` | A command that reads a question on stdin and prints the answer, in place of Claude Code (oneshot.ts); tests swap one in. | [`config.ts`](../server/config.ts) |
| `ARISTOTLE_WAIT_MS` | How long quiz and ask wait for an answer before handing control back to Claude. | [`config.ts`](../server/config.ts) |
| `ARISTOTLE_CLAUDE_CWD` |  | [`config.ts`](../server/config.ts) |
| `ARISTOTLE_RELEASE_DIR` | Where the release copy lives: a Git worktree of this repository that the live service runs. | [`release.ts`](../scripts/release.ts) |
<!-- /generated -->

This install's own choices (not in Git) go in `.aristotle/settings.json`, e.g. `{"accent": "red"}` (blue, red, violet or graphite).

## Troubleshooting

- **`pnpm app status`** says which instance answers on the live port, from which folder, and whether systemd runs it.
- The live server's log: `journalctl --user -u aristotle.service` (systemd) or `.aristotle/server.log`.
- **Port in use** on `pnpm dev`: another dev instance is running (`pnpm dev` holds 4757 and 5173).
- **"The interface is not built yet"**: `pnpm build` (or `pnpm release` for the release copy).
- The dev interface shows nothing: the dev server is down or still starting; its errors are in the `pnpm dev` terminal.
