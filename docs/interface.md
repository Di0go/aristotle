# Interface

## Look

Quiet and dense, like a notes vault: soft greys stepping from the page to the panes, one accent colour, Inter for everything read and JetBrains Mono only for code and keys (both self-hosted through Fontsource). Dark by default, light on a switch. No mascots, no marketing, no onboarding. The look is set on `<html>` before the first paint by [`public/theme-boot.js`](../ui/public/theme-boot.js) (a file of its own, since the CSP allows no inline script), from what [`theme.svelte.ts`](../ui/src/lib/theme.svelte.ts) remembers, so a dark page never flashes white while the app loads.

All colours, type and spacing are **tokens** on `:root` in [`base.css`](../ui/src/styles/base.css), redefined for `[data-theme='dark']`, and the accent per `[data-accent]` (blue, red, violet, graphite). Components read tokens, never raw colours; the few status colours (`--solid`, `--shaky`, `--wrong`, `--heart`) are tokens too. Some older names (`--paper`, `--link`, `--serif`…) are kept as aliases.

| Stylesheet | Covers |
|---|---|
| [`base.css`](../ui/src/styles/base.css) | tokens, both themes, resets, buttons and inputs, loading skeletons |
| [`shell.css`](../ui/src/styles/shell.css) | the frame: ribbon, sidebar, tabs, status line, drawer |
| [`prose.css`](../ui/src/styles/prose.css) | rendered Markdown: text, maths, code, callouts, figures, and the containment that keeps it in its box |
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

- **Ribbon**: labelled places, Home, Courses (every course and class, `#/roadmaps`), Map, Search and You (About you, `#/about`), then Focus and the appearance menu. Claude Code's terminal is not a place: it is "Terminal" in the status line (Ctrl+`), and opens by itself when Claude asks something only it can answer ([`Ribbon.svelte`](../ui/src/lib/Ribbon.svelte)). Progress, the Log and Missions are reached from Home's panels; Home keeps a Courses panel too.
- **Status line** ([`StatusLine.svelte`](../ui/src/lib/StatusLine.svelte)): your turn or Claude working, the class's progress, Terminal; and on its left, in amber, whatever the server says he should know (a backup that keeps failing, a data file skipped as unreadable: `warnings` in the feed), the first in full and the rest on hover. Nothing when all is well.
- **Library tree**: courses, their classes, and in each class its pages: the Intro and every step, each with its mark; every active course ends with its **Final mission** (after N more, designing, to do, to review, ✓) ([`Sidebar.svelte`](../ui/src/lib/Sidebar.svelte), [`library.ts`](../ui/src/lib/library.ts)). Every folder folds with its arrow; clicking a folder's name opens its page and unfolds it.
- **Home** (`#/`, [`Home.svelte`](../ui/src/lib/Home.svelte)) is the dashboard. One card says what to do now, with the one primary button (answer the question waiting, review what is fading, continue the last class, start the next class of a course); a question left waiting since an earlier sitting still gets the card, with "Or review … fading first" under it, so the review is never hidden. Then panels, each a short live list with its way onwards at the foot: This week (minutes, concepts made solid, days in a row, the last two weeks), Courses, To review (fading and coming due, with a Review button; each concept opens on its page, scrolled to its panel, where a fading one has "Review it now" for itself, or for every fading concept of its class), Recent answers, Words you looked up, Missions. A review or a training set running now shows here, since neither belongs to a class ([`Now.svelte`](../ui/src/pages/Now.svelte)). Until the feed has loaded (everything at once, [`feed.svelte.ts`](../ui/src/lib/feed.svelte.ts)) Home and the library show quiet skeletons instead of empty lists that then jump. The week follows the day (it turns over at midnight); summaries the server works out (sessions, progress, the review queue) are fetched again once the feed has been quiet for a moment after a change, with one shared request for the sessions list.
- **A class** (`#/lesson/<slug>`, [`Lesson.svelte`](../ui/src/pages/Lesson.svelte)): where you are, with its one button; the pages, one mark each (✓ done with nothing wrong, `1/2` when something went wrong, "to answer", ● being taught now); the box to continue; and beside them what the class teaches, its concepts, with training, review and its mission. Its concepts open on **the class's map** (`#/topics/<slug>?c=<concept>`, [`Topic.svelte`](../ui/src/pages/Topic.svelte)): the outline, the graph and one concept's record. The live map carries only each concept's newest checks; the record fetches the whole topic when there are more.
- **A step** (`#/lesson/<slug>/<n>`, [`ClassPage.svelte`](../ui/src/lib/ClassPage.svelte)) with Previous and Next ([`steps.ts`](../ui/src/lib/steps.ts) and [`classes.svelte.ts`](../ui/src/lib/classes.svelte.ts) build the pages). The class is an **Intro** (the big picture, what he already knew, the plan) and one page per step, numbered across the whole class whichever sitting taught it; the checks a later sitting opens with are the next step's **warm-up**; the summary closing a sitting is left out. The step being taught is its page, live: it grows as Claude teaches, carries the composer, and a new step takes him along if he was on the last page. Starting or continuing a class waits on the class and moves to the step being taught when it starts. Its foot says what is happening ([`LessonActivity.svelte`](../ui/src/lib/LessonActivity.svelte)): Claude preparing the next step, or Claude waiting for him and where to answer. Working is read from Claude Code's status line in the terminal (its spinner word and token counter), and counts from the moment Aristotle sends Claude something ([`claude.svelte.ts`](../ui/src/lib/claude.svelte.ts)). His questions on its passages are kept under it. Number keys in a title are dropped. Moving between steps of one class keeps the page (each page's code is imported once, [`App.svelte`](../ui/src/App.svelte)), so the step page resets what belongs to one step itself: the narrow-screen panel closes, the live page is followed from its start, and the notebook saves what was being typed before it shows the next step's.
- **The panel beside a step** ([`LessonBench.svelte`](../ui/src/lib/LessonBench.svelte)) has two tabs, This step and Chat. **Chat** ([`ChatPanel.svelte`](../ui/src/lib/ChatPanel.svelte)) talks with Aristotle, a second Claude beside the tutor. Each message goes with where he is and the page as text (the step, its checks, his answers), and with whatever he tags with `@` (a step, a concept or a class; a picker opens as he types, and tags show as chips). The answer streams in with the Aristotle mark beside it (rendered block by block, so only the paragraph being written renders again, and kept in view at most once a frame unless he has scrolled up to reread), answers even while a question waits, never moves the lesson, and can be stopped (what it wrote so far stays, marked stopped). The conversation belongs to the class: leaving and coming back finds it there; Clear starts it over. The composer is one row: `@` to tag, the message, and a round send button that stays put, faint until there is something to send (Stop takes its place while Aristotle writes). **This step**, in plain words: what the step teaches (its block's concept), what it builds on (green when he holds it) and what it leads to; then **Your notes on this step**, his notebook for that step (a plain, roomy writing space that grows as he writes), saved as he types and kept with it (`/api/notes`). "Hide »" folds the panel away for the step to take the width, "« Panel" brings it back; remembered per browser ([`bench.svelte.ts`](../ui/src/lib/bench.svelte.ts)).
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
- **Claude Code starts when Aristotle opens** (once per page load, never again after he stops it), so it is ready before he asks for anything. Not in the dev instance, whose Claude Code would still teach through the live app's MCP server. It lives as long as the app, so a lesson, review or training set started from the interface with no sitting in progress (no session open, or the open one idle for 15 minutes: a sitting nobody closed stays open on disk for days) and Claude idle at its prompt sends `/clear` first and its command a moment later ([`actions.ts`](../ui/src/lib/actions.ts)): each sitting starts from a clean context instead of carrying every earlier one. Planning a course or a mission is a conversation and keeps its context.

## What a lesson can contain

Everything Claude sends is Markdown, so this is also the list of what Claude can be told to use (the tool descriptions in [`server/mcp.ts`](../server/mcp.ts) say the same to Claude):

- LaTeX maths, `$…$` and `$$…$$` (KaTeX);
- ```` ```mermaid ```` diagrams (drawn in the app's colours, again when the theme or accent changes, and kept so a step revisited shows them at once), and inline `<svg>` (which may animate with SMIL; Play/Pause and Replay are added, and it pauses by itself while out of sight unless he paused it);
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
| `flow` | [`Flow.svelte`](../ui/src/lib/kit/Flow.svelte) | A pathway: boxes and arrows laid out automatically, signals travelling along the arrows (fast or slow), optional drawings of what is in each box, travels each arrow or comes out of a box, and optional steps that light up one part of it at a time. |
| `plate` | [`Plate.svelte`](../ui/src/lib/kit/Plate.svelte) | A real image (an anatomical plate, a photo) with numbered markers: point at one, or at its line in the key, and both light up with its label. |

Explorables, a fenced `explorable` block with `{"id": …}`:

| Id | Title |
|---|---|
| `heart-rate` | Brake, accelerator and your heart |
| `stress-hormones` | Two hours after a stressor |
<!-- /generated -->

A `flow` can draw the things it moves, not only name them: `art` puts a drawing in a box, `carries` sends one along an arrow in place of the plain pulse, and `makes` lifts drawings out of a lit box. They come from [`Glyph.svelte`](../ui/src/lib/kit/Glyph.svelte): molecules as balls and sticks in the usual atom colours (`--atom-*` tokens in `prose.css`, one set per theme), electrons, protons, ATP and the electron carriers. A name it does not know is drawn as a chip with the name in it, so any subject can use the fields.

Lesson text is untrusted (a tutor can be prompt-injected), so [`markdown.ts`](../ui/src/lib/markdown.ts) sanitises everything (DOMPurify): no `<style>`, no forms or form controls (a task list's boxes are drawn, not inputs), no `action`/`formaction`; a link that opens elsewhere gets `rel="noopener noreferrer"`; an SVG may animate but never animate a link or an event. Rendered content is paint-contained (`.md`, `.md-inline`, `.md-box` in [`prose.css`](../ui/src/styles/prose.css)): whatever it positions, even with the app's own classes, stays inside its box. Text that can't be rendered shows as written, and each feed entry has its own boundary, so one bad block never takes the page with it.

Maths: KaTeX loads after the first paint ([`maths.svelte.ts`](../ui/src/lib/maths.svelte.ts)); a formula met before it arrives shows its source quietly and renders when it does. Its output is put in after sanitising, behind placeholders the text can't forge. Rendered HTML is kept by source (the last 400 pieces), and each drawing's ids are prefixed from a hash of its text. Animations (lesson SVGs, the kit's flows, explorables) run only while seen ([`visible.ts`](../ui/src/lib/visible.ts)).
