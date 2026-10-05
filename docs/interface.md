# Interface

## Look

Quiet and dense, like a notes vault: soft greys stepping from the page to the panes, one accent colour, Inter for everything read and JetBrains Mono only for code and keys (both self-hosted through Fontsource). Dark by default, light on a switch. No mascots, no marketing, no onboarding.

All colours, type and spacing are **tokens** on `:root` in [`base.css`](../ui/src/styles/base.css), redefined for `[data-theme='dark']`, and the accent per `[data-accent]` (blue, red, violet, graphite). Components read tokens, never raw colours; the few status colours (`--solid`, `--shaky`, `--wrong`, `--heart`) are tokens too. Some older names (`--paper`, `--link`, `--serif`…) are kept as aliases.

| Stylesheet | Covers |
|---|---|
| [`base.css`](../ui/src/styles/base.css) | tokens, both themes, resets, buttons and inputs |
| [`shell.css`](../ui/src/styles/shell.css) | the frame: ribbon, sidebar, tabs, status line, drawer |
| [`prose.css`](../ui/src/styles/prose.css) | rendered Markdown: text, maths, code, callouts, figures |
| [`lesson.css`](../ui/src/styles/lesson.css) | lessons: blocks, quizzes, asks, the composer, the bench beside a lesson |
| [`map.css`](../ui/src/styles/map.css) | knowledge maps and roadmaps |
| [`charts.css`](../ui/src/styles/charts.css) | the Progress page's charts |

Styles for one component live in its `<style>` block; the files above are for what many share.

## Layout

```
┌ribbon─┬ library tree           ┬ tabs ─────────────────────────────┐
│ Home  │ course                 │ page                      │ bench │
│Courses│  └ class               │ (Home, a class, a step,   │ (on a │
│ Map   │     └ intro, steps     │  the map, a course…)      │  step)│
│ Search│                        │
│ Claude│                        │                           │       │
└───────┴────────────────────────┴ status line ──────────────────────┘
                                   terminal drawer (Claude Code, Ctrl+`)
```

### Three words

Everything he opens is one of three things, and each word means only that:

- a **course** (a roadmap in the data and to Claude): a path of classes towards something bigger ([`Roadmap.svelte`](../ui/src/pages/Roadmap.svelte));
- a **class** (a topic in the data): one subject, taught over as many sittings as it takes;
- a **step**: one idea of a class, its checks and his answers.

Concepts are what a class teaches, shown beside it, never a level of their own. Sessions, lessons and handoffs are the tutor's record and never reach the screen; "where you are" is said from the class itself. A course's position is "class N of M". A mission (Praxis, to Claude) is a page of its own.

### Places

- **Ribbon**: labelled places, Home, Courses (every course and class, `#/roadmaps`), Map, Search and You (About you, `#/about`), then Claude, Focus and the appearance menu ([`Ribbon.svelte`](../ui/src/lib/Ribbon.svelte)). Progress, the Log and Missions are reached from Home's panels; Home keeps a Courses panel too.
- **Library tree**: courses, their classes, and in each class its pages: the Intro and every step, each with its mark; every active course ends with its **Final mission** (after N more, designing, to do, to review, ✓) ([`Sidebar.svelte`](../ui/src/lib/Sidebar.svelte), [`library.ts`](../ui/src/lib/library.ts)). Every folder folds with its arrow; clicking a folder's name opens its page and unfolds it.
- **Home** (`#/`, [`Home.svelte`](../ui/src/lib/Home.svelte)) is the dashboard. One card says what to do now, with the one primary button (answer the question waiting, continue the last class, start the next class of a course); then panels, each a short live list with its way onwards at the foot: This week (minutes, concepts made solid, days in a row, the last two weeks), Courses, To review (fading and coming due), Recent answers, Words you looked up, Missions. A review or a training set running now shows here, since neither belongs to a class ([`Now.svelte`](../ui/src/pages/Now.svelte)).
- **A class** (`#/lesson/<slug>`, [`Lesson.svelte`](../ui/src/pages/Lesson.svelte)): where you are, with its one button; the pages, one mark each (✓ done with nothing wrong, `1/2` when something went wrong, "to answer", ● being taught now); the box to continue; and beside them what the class teaches, its concepts, with training, review and its mission. Its concepts open on **the class's map** (`#/topics/<slug>?c=<concept>`, [`Topic.svelte`](../ui/src/pages/Topic.svelte)): the outline, the graph and one concept's record.
- **A step** (`#/lesson/<slug>/<n>`, [`ClassPage.svelte`](../ui/src/lib/ClassPage.svelte)) with Previous and Next ([`steps.ts`](../ui/src/lib/steps.ts) and [`classes.svelte.ts`](../ui/src/lib/classes.svelte.ts) build the pages). The class is an **Intro** (the big picture, what he already knew, the plan) and one page per step, numbered across the whole class whichever sitting taught it; the checks a later sitting opens with are the next step's **warm-up**; the summary closing a sitting is left out. The step being taught is its page, live: it grows as Claude teaches, carries the composer, and a new step takes him along if he was on the last page. Starting or continuing a class waits on the class and moves to the step being taught when it starts. His questions on its passages are kept under it. Number keys in a title are dropped.
- **The panel beside a step** ([`LessonBench.svelte`](../ui/src/lib/LessonBench.svelte)), in plain words: what the step teaches (its block's concept), what it builds on (green when he holds it) and what it leads to; then **Your notes on this step**, his notebook for that step (a ruled page that grows as he writes), saved as he types and kept with it (`/api/notes`). "Hide »" folds the panel away for the step to take the width, "« Panel" brings it back; remembered per browser ([`bench.svelte.ts`](../ui/src/lib/bench.svelte.ts)).
- **About you** (`#/about`, [`About.svelte`](../ui/src/pages/About.svelte)): what he does, his projects, what he wants, saved as he types. Claude reads it (`read_about`) before planning a course or designing a mission.
- **Missions happen on their own**: a course whose classes are all done gets its final mission designed by Claude as it closes the last class; [`automatic.svelte.ts`](../ui/src/lib/automatic.svelte.ts) asks for it once if that didn't happen. A course shows "Where you'll use it" when he has said.
- **Tabs**: one per page visited, eight at most, remembered per browser; a class keeps one tab whichever of its pages is open ([`tabs.svelte.ts`](../ui/src/lib/tabs.svelte.ts)).
- **Search**: Ctrl+K or `/`, answered by the server ([`server/search.ts`](../server/search.ts)) over the library, missions and session text.
- **Focus mode**: F (or Focus in the ribbon or on a step) hides everything but the page; Escape or F brings it back, remembered per browser ([`focus.svelte.ts`](../ui/src/lib/focus.svelte.ts)).
- **Routes** are hashes, listed in [`router.svelte.ts`](../ui/src/lib/router.svelte.ts).

### On a page

- **Hover cards** on terms, glossed phrases and concept links ([`HoverCard.svelte`](../ui/src/lib/HoverCard.svelte)); a **lightbox** for images and figures.
- **Right-click on selected text** opens Aristotle's menu ([`ContextMenu.svelte`](../ui/src/lib/ContextMenu.svelte)): Copy, Search Aristotle (the palette, with the selection typed in), Gloss and Ask about this. Without a selection, in a text box or the terminal, or with Shift held, the browser's own menu opens.
  - **Gloss** asks Claude Code for a short explanation of the phrase in the sense the passage uses it, shown in a card pinned under the selection, which follows the words as the page scrolls and then hangs from the marked phrase ([`gloss.svelte.ts`](../ui/src/lib/gloss.svelte.ts)). When the phrase names something seen better than described, the card carries a picture from Wikimedia Commons with its credit. From then on the phrase is a hover term (dotted underline) wherever it appears in a lesson, until he forgets it from its card.
  - **Ask about this** opens a panel by the passage for his question ([`AskPanel.svelte`](../ui/src/lib/AskPanel.svelte), [`aside.svelte.ts`](../ui/src/lib/aside.svelte.ts)). Claude Code answers there, with the paragraph and the step as context, while the class carries on; the question and its answer are kept under the step.
- **Questions left unanswered** in the latest session stay answerable wherever they show, also on a class's step pages or a past session's page, even after the session has ended. If no tool call was waiting for the answer (the server says so in `X-Aristotle-Heard`), answering the last open one hands over to Claude ([`actions.ts`](../ui/src/lib/actions.ts)): it is told to collect the answers, or the class continues.
- **Claude Code starts when Aristotle opens** (once per page load, never again after he stops it), so it is ready before he asks for anything. Not in the dev instance, whose Claude Code would still teach through the live app's MCP server.

## What a lesson can contain

Everything Claude sends is Markdown, so this is also the list of what Claude can be told to use (the tool descriptions in [`server/mcp.ts`](../server/mcp.ts) say the same to Claude):

- LaTeX maths, `$…$` and `$$…$$` (KaTeX);
- ```` ```mermaid ```` diagrams, and inline `<svg>` (which may animate with SMIL; play and replay buttons are added);
- `==highlights==`, `{{term|definition}}` hover terms, `[[concept-id]]` links to the map;
- Obsidian callouts: `> [!idea] Title` (idea, key, why, context, example, you, careful, term, note);
- `![alt](url "caption")` as a captioned figure;
- ```` ```sequence ```` blocks: frames split by `---`, stepped through with Next and Back;
- the **visual kit** and **explorables**, fenced blocks of JSON that become live components:

<!-- generated: kit -->
Visual kit, a fenced block in the figure's language:

| Language | Component | What it draws |
|---|---|---|
| `balance` | [`Balance.svelte`](../ui/src/lib/kit/Balance.svelte) | Two forces pulling one value: a dial with a needle, a bar for each force, and states to step through (or two sliders to try it yourself). |
| `timeline` | [`Timeline.svelte`](../ui/src/lib/kit/Timeline.svelte) | Things that happen over time, on one axis (logarithmic when they span seconds to hours). |
| `flow` | [`Flow.svelte`](../ui/src/lib/kit/Flow.svelte) | A pathway: boxes and arrows laid out automatically, signals travelling along the arrows (fast or slow), and optional steps that light up one part of it at a time. |
| `plate` | [`Plate.svelte`](../ui/src/lib/kit/Plate.svelte) | A real image (an anatomical plate, a photo) with numbered markers: point at one, or at its line in the key, and both light up with its label. |

Explorables, a fenced `explorable` block with `{"id": …}`:

| Id | Title |
|---|---|
| `heart-rate` | Brake, accelerator and your heart |
| `stress-hormones` | Two hours after a stressor |
<!-- /generated -->

Everything is sanitised (DOMPurify) after rendering; an SVG may animate but never animate a link.
