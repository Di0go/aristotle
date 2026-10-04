# Mind Gym

A personal gym for the mind. Claude Code is the tutor; this app is where you read, answer, and see what you've learned.

It runs entirely on your machine and on your Claude subscription: Claude Code calls the gym's tools, and the gym shows lessons, quizzes and open questions in the browser.

## Use it

```sh
pnpm install
claude            # in this folder; the gym starts by itself
```

Open http://gym.test (or http://localhost:4747), then type `/teach` and what you want to learn, or `/teach continue`. Read and answer in the browser; talk to Claude in the terminal (questions, "go", "stop for today").

The first time, Claude Code asks you to trust the folder and to enable the `gym` MCP server: accept both.

`http://gym.test` needs a one-off system setup, in the same style as `bancada.test` and `playground.test`: a hosts entry on 127.0.0.82 and an nftables rule that forwards its port 80 to 4747. Run `pkexec bash scripts/setup-hostname.sh` (it explains how to undo it).

| Command | What it does |
|---|---|
| `pnpm start` | Build the interface and (re)start the server |
| `pnpm gym status` / `start` / `stop` / `restart` | Control the server |
| `pnpm check` | Type-check |
| `pnpm test` | End-to-end tests |

## How it works

```
Claude Code ──stdio──▶ server/bridge.ts ──HTTP /mcp──▶ server (127.0.0.1:4747) ◀──▶ browser (gym.test)
```

- **The method** is the `/teach` skill (`.claude/skills/teach/SKILL.md`): probe the edge of what you know, plan a map of what depends on what, then teach one reasoning step at a time with a check after each. A `researcher` subagent (`.claude/agents/researcher.md`) fact-checks and scopes topics.
- **Tools Claude uses:** `list_topics`, `get_topic`, `start_session`, `update_map` (concepts, prerequisites, statuses), `show` (a lesson step), `quiz` (graded multiple choice, waits for your answer), `ask` (you write the answer, waits), `collect_answers` (answers given after you stepped away), `end_session` (the handoff for next time).
- **The interface:** *Now* is the live lesson with the topic's map beside it; *Topics* lists every topic with its map, each concept's history and the next step; *Log* has every session, replayable.
- **Your data** (plain files, yours to keep): `data/topics/` one knowledge map per topic, `data/sessions/` one append-only log per session, `data/profile.md` what the tutor has learned about how you learn.

## Credits

- **Eero Alvar** for the method and the idea: [How I Use AI to Learn Things](https://youtu.be/kzcI5F4tGiU) (probe → plan → teach, one reasoning step at a time, quizzes as feedback, engineered trust) and [Bodybuilding for the Mind](https://www.youtube.com/watch?v=o0DtxUJ6rAc) (struggle as the training signal, AI as the training equipment).
- **[amosblomqvist/learn](https://github.com/amosblomqvist/learn)**: the original setup from that video, for the pi agent. Its teaching principles and quiz design inspired this project's. No text or code is copied (the repository has no licence).
- **[vasanthsreeram/Alvarmethod](https://github.com/vasanthsreeram/Alvarmethod)** (MIT): the port to Claude Code and other agents, and the idea of per-topic maps and resumable session files.
