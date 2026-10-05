# Interface

## Look

Quiet and dense, like a notes vault: soft greys stepping from the page to the panes, one accent colour, Inter for everything read and JetBrains Mono only for code and keys (both self-hosted through Fontsource). Dark by default, light on a switch. No mascots, no marketing, no onboarding.

All colours, type and spacing are **tokens** on `:root` in [`base.css`](../ui/src/styles/base.css), redefined for `[data-theme='dark']`, and the accent per `[data-accent]` (blue, red, violet, graphite). Components read tokens, never raw colours; the few status colours (`--solid`, `--shaky`, `--wrong`, `--heart`) are tokens too. Some older names (`--sheet`, `--cyan`, `--serif`…) are kept as aliases.

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
┌ribbon┬ sidebar (library tree)  ┬ tabs ────────────────────────────┐
│      │ roadmap                 │ page                     │ bench │
│      │  └ step (a topic)       │ (lesson, map, roadmap…)  │ (map, │
│      │     └ concept           │                          │ outline)
└──────┴─────────────────────────┴ status line ─────────────────────┘
                                   terminal drawer (Claude Code, Ctrl+`)
```

- **Sidebar**: the library as a tree, roadmap > step > concept ([`Sidebar.svelte`](../ui/src/lib/Sidebar.svelte), [`library.ts`](../ui/src/lib/library.ts)).
- **Tabs**: one per page visited, eight at most, remembered per browser ([`tabs.svelte.ts`](../ui/src/lib/tabs.svelte.ts)).
- **Search**: Ctrl+K or `/`, answered by the server ([`server/search.ts`](../server/search.ts)) over the library, missions and session text.
- **Hover cards** on terms and concept links ([`HoverCard.svelte`](../ui/src/lib/HoverCard.svelte)); a **lightbox** for images and figures.
- **A class read back** (`#/lesson/<slug>`, [`Lesson.svelte`](../ui/src/pages/Lesson.svelte)) is split into parts by [`sections.ts`](../ui/src/lib/sections.ts): what he already knew (the probe), the plan, each step with its checks, the summary. Each part folds to one line with how its checks went ([`LessonPart.svelte`](../ui/src/lib/LessonPart.svelte)); only where to pick up and the last summary start open, and a contents list at the top jumps to any part. Answered questions show just his pick and the right answer, with the rest behind a link. The live lesson (Now) is not folded.
- **Routes** are hashes (`#/lesson/<slug>`, `#/topics/<slug>?c=<concept>`…), listed in [`router.svelte.ts`](../ui/src/lib/router.svelte.ts).

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
