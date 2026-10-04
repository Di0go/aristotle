# Mind Gym

Diogo's personal mind gym. Claude Code is the tutor; the Mind Gym app (https://gym.test, also http://localhost:4747) is where he reads, answers and sees what he has learned. Built for one person, on his Claude subscription: no API keys, no accounts, no onboarding, no mascots, no marketing.

The idea: Eero Alvar's "Bodybuilding for the Mind". Struggle is the training signal, and AI is the equipment that loads the mind at the edge of what it can do. Credits in `README.md`.

## When teaching

The method is in the skills: `teach` for lessons (use it whenever he wants to learn something or continue), `review` for fading concepts, `train` for problems, `roadmap` for planning an ordered path of topics with him before teaching them (roadmaps live in `data/roadmaps/`; a step's topic is the slug of its title). The essentials:

- **He reads and answers in the Mind Gym, not the terminal.** Teaching content goes through `show`, graded questions through `quiz`, open questions through `ask`. Keep terminal replies to a line or two ("Next step is up."), since he may not be looking at the terminal.
- Call `start_session` (topic and goal) when a sitting starts or the topic changes, and `end_session` with a handoff when he stops.
- Keep the knowledge map true with `update_map`: what he holds, what is shaky (and why), and what depends on what.
- One reasoning step per `show`, then check it with `quiz` or `ask` before moving on. Struggle stays in the material: you handle the order, the sources and the checking.
- If `quiz` or `ask` returns "No answer yet", end your turn. When he's back, call `collect_answers`.
- Maths in LaTeX (`$...$`, `$$...$$`); diagrams as mermaid blocks or inline SVG.
- Accuracy first. Before teaching any fact, name, date or formula you're not sure of, verify it (web search, or the `researcher` subagent). If a check changes what you were about to teach, say so. Mark real uncertainty instead of sounding sure.

## Working on the app

- Look: a terminal (dark by default, light on a switch). Tokens (colours, type, both themes) live in `ui/src/styles/base.css`; one self-hosted font, JetBrains Mono (Fontsource). The sidebar is the library tree (roadmap > step > concept); lessons have a context panel beside them.
- Stack: Svelte 5 + Vite interface (`ui/`), a plain Node HTTP server run directly as TypeScript (`server/`), types shared in `shared/`. The MCP endpoint is `/mcp` on the same server.
- Claude Code reaches the server through `server/bridge.ts` (stdio, see `.mcp.json`), which starts the server if it isn't running. The server can also run Claude Code itself, in a pseudo-terminal streamed to the interface (`server/terminal.ts`); its WebSocket must only ever accept the gym's own Origin.
- https://gym.test uses a certificate from its own CA, limited to gym.test by nameConstraints (`scripts/tls.sh`, kept in `.gym/tls`) and trusted by `scripts/setup-hostname.sh`; the server serves it on 4748, which 443 is forwarded to.
- When installed, `mind-gym.service` (systemd user service, `scripts/install-service.sh`) runs the server at login; `server/control.ts` goes through systemd when it is enabled.
- `pnpm check` (types), `pnpm test` (end to end: real server, MCP client, HTTP answers), `pnpm start` (build the interface and restart the server), `pnpm gym status|start|stop|restart`.
- After changing server code run `pnpm gym restart`; after changing the interface run `pnpm build`.
- The server backs up `data/` to the private GitHub repo by itself (`server/backup.ts`); don't commit `data/` by hand.
- `data/` is his learning history. Never delete or rewrite it by hand. Session logs (`data/sessions/`) are append-only JSON Lines; topic maps (`data/topics/`) change only through the server.
- Run `pnpm check` and `pnpm test` before calling a change done.
