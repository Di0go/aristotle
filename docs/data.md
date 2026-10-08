# Data

Everything Aristotle knows about the learner is plain files in `data/` (or wherever `ARISTOTLE_DATA_DIR` points). They are readable without the app, and the app rebuilds all its state from them on start.

```
data/
├── topics/<slug>.json        one knowledge map per topic
├── sessions/<id>.jsonl       one append-only log per session
├── roadmaps/<slug>.json      one file per roadmap
├── missions/<id>.json        one file per Praxis mission
├── glosses.json              the phrases he asked to have explained, with their glosses
├── asides.json               his questions on passages of a lesson, with Claude's answers
├── notes.json                his notebook on each step, in his words
├── about.md                  About you: what he does and wants, in his words
├── chats/<thread>.json       the chat beside each class ("home" for the rest), and its Claude Code session
└── profile.md                what the tutor has learned about how he learns (written by the skills)
```

The types are in [`shared/types.ts`](../shared/types.ts); that file is the schema. Ids and slugs come from titles through [`slugify`](../server/slug.ts), which keeps letters of any script (`Ἀρετή` is `αρετη`, `日本語の文法` stays as it is) and drops Latin accents. Before that, letters outside a-z were dropped (so every Greek or Japanese title became `untitled`); records made then keep their ids, and lookups by title try both forms (`slugCandidates`).

## Rules

- **`data/` is a learning history: never delete or rewrite it by hand**, and never add it to the app's repository (it is git-ignored, and it is its own Git repository).
- **Change it only through the server.** Every JSON file is rewritten whole, atomically (a temporary file, then a rename), one write at a time per file, by [`store.ts`](../server/store.ts). A write that fails is the caller's error but never blocks the next write of that file, which carries the latest state, so memory and disk meet again. Session logs are only ever appended to (a session left open is closed by an `end` line without a handoff when the next one starts); a line that fails to append is kept in memory and written with the next one (a warning says so meanwhile), and a last line torn by a crash is ended with a newline on start, so it costs only itself.
- **Changing a format means old files must still load.** New fields are optional, or have a default where the file is read. There is no migration step; the readers are lenient instead.
- **One bad file never stops the server.** A file that doesn't parse, or lacks the fields its store needs (a topic without `slug`, `title`, `concepts` and `sessions`, say), is renamed aside to `<name>.unreadable-<when>`, never deleted or overwritten, and the interface shows a warning until it is fixed (renamed back) or deleted. Warnings ([`warnings.ts`](../server/warnings.ts)) also say when the backup keeps failing.
- To work on real data, copy it: `pnpm dev:snapshot`.

## Topics

`topics/<slug>.json` is a `Topic`: title, goal, the `concepts` of its knowledge map, the concept in `focus`, the last `handoff` (what locked in, what is shaky, where to pick up), the ids of its `sessions` and its `training` level.

Each `Concept` has an id, a label, a status (`unknown`, `shaky`, `solid`), its prerequisites (`deps`, as ids in the topic or `other-topic/id`), an optional `note` (a misconception to watch), its `evidence` (every quiz answer, written answer, review and problem on it, with the session and item it came from) and, from the first time it became solid, a `review` card: the FSRS schedule that decides when it starts fading ([`reviews.ts`](../server/reviews.ts)). The file keeps every evidence entry; the live map the interface holds (`/api/map` and `topic` events) carries only each concept's newest five, with `evidenceTotal`, and `/api/topics/<slug>` sends the whole topic.

## Session logs

`sessions/<id>.jsonl` holds one JSON object per line, each an operation, replayed in order to rebuild the session ([`feed.ts`](../server/feed.ts)):

| `op` | What happened |
|---|---|
| `session` | the session started: id, kind (`learn`, `review`, `train`), topic, goal |
| `add` | an item was shown: a `block` (from `show`), a `quiz`, an `ask`, or a `map` change |
| `answer` | the learner answered a quiz or an ask |
| `delivered` | the answer was handed back to Claude |
| `end` | the session ended, with its handoff |
| `resume` | a closed session was picked up again: he answered one of its questions later, or a lesson continued it because questions were still open |

The current session is the one that last had anything happen, open ones first: the newest log, unless an older one was picked up again since. On start the server looks for it among the newest 50 logs.

Quiz items keep the right answers and explanations; the interface only receives them once the question is answered (`PublicItem`).

## Roadmaps and missions

`roadmaps/<slug>.json` is a `Roadmap`: title, goal, status (`draft` or `active`), `use` (where he will use it, in his words; its final mission is built from it) and ordered steps, each a topic by slug with its own goal and why. A step's progress is not stored: it is read from its topic's map.

`missions/<id>.json` is a `Mission`: scope (`step`, `capstone` or `topic`), the roadmap and topic it follows, the brief, criteria and concepts, and later his `debrief` and Claude's review (one verdict, `achieved`, `partly` or `missed`, and a critique that goes through each criterion). Reviewing a mission records evidence on its concepts.

## Glosses

`glosses.json` is an array of `Gloss`: a phrase he selected and asked to have explained (from the context menu), the explanation Claude Code wrote, the passage and topic it came from, an optional `image` (a Wikimedia Commons rendition with its page and credit), and when. One per phrase: its `id` is the phrase as a slug, so asking again, in any case or with hyphens for spaces, returns the same gloss; two phrases with the same slug ("C#" and "C++") get numbered ids (`c`, `c-2`). Forgetting one removes it from the file. The whole file is rewritten atomically on every change ([`glosses.ts`](../server/glosses.ts)); `get_topic` lists a topic's glosses for the tutor, as gaps he noticed himself.

## Questions on a passage

`asides.json` is an array of `Aside`: a question he asked about a passage he selected ("Ask about this"), the passage, Claude Code's answer, the topic, and the feed item the passage was in (so the step's page can show it), with when. Rewritten whole and atomically on every change ([`asides.ts`](../server/asides.ts)); `get_topic` lists a topic's questions for the tutor.

## His words: step notes and About you

`notes.json` is an array of `StepNote`: the topic, the id of the step's block, the step's title when he wrote it, his text and when; an emptied notebook is removed. `about.md` is his About you page as plain text. Both are written only from the interface ([`notes.ts`](../server/notes.ts)); `get_topic` lists a topic's notes, `read_about` returns About you.

## Chats

`chats/<thread>.jsonl` is a chat's log, appended to and never rewritten ([`chat.ts`](../server/chat.ts)): one JSON object per line, `{"op":"message","message":…}` (his or Aristotle's, with when; his keep what he tagged with `@`, an answer he stopped is marked), `{"op":"session","session":…}` (the Claude Code session it continues, or none) and `{"op":"clear"}` (started over). The thread is a class's slug, or `home`. A chat from before logs were used is a whole `chats/<thread>.json` (a `ChatThread`); it is still read, never rewritten, and its log, if any, applies on top of it. The interface loads a chat's newest 300 messages.

## Backup

If `data/` is a Git repository, the live server commits it after ten quiet minutes and when a session ends, and pushes if it has a remote ([`backup.ts`](../server/backup.ts)). Off in dev and with `ARISTOTLE_BACKUP=off`. Setup is in the [README](../README.md#keep-a-history-of-your-data-and-back-it-up).
