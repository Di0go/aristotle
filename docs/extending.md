# Extending Aristotle

Recipes for the changes that come up most. Each lists every place to touch, because most features cross the line between Claude Code, the server and the interface. Work in the dev instance (`pnpm dev`, see [development.md](development.md)) and end with `pnpm gates`.

## The shape of a feature

Most features are some of these layers, in this order:

1. **Data**: a type in [`shared/types.ts`](../shared/types.ts) and where it is stored ([data.md](data.md)). New fields optional, so old files still load.
2. **Server logic**: a method on the store that owns it ([`topics.ts`](../server/topics.ts), [`feed.ts`](../server/feed.ts), [`roadmaps.ts`](../server/roadmaps.ts), [`missions.ts`](../server/missions.ts)), or on [`Gym`](../server/gym.ts) when it ties several together.
3. **For Claude**: an MCP tool, or a change to one ([below](#add-an-mcp-tool)).
4. **For the interface**: an API route and/or an SSE event, and the page or component that shows it.
5. **For the method**: the skill that should use it ([teaching.md](teaching.md)).
6. **Proof**: a test in [`tests/mcp.test.ts`](../tests/mcp.test.ts) that drives it the way Claude and the browser would.

## Add an MCP tool

1. Register it in `createMcpServer` in [`server/mcp.ts`](../server/mcp.ts) with `mcp.registerTool(name, { title, description, inputSchema }, handler)`. The **description is the documentation Claude reads**: say what it is for, when to call it and what it returns. Describe every input with zod's `.describe()`.
2. Keep the handler thin: validate, call a `Gym` (or store) method, format a short text answer with `text()`, or `error()` for a mistake Claude can fix.
3. If it waits for the learner, follow `quiz`: add the item, then `waitForLearner`, and handle "No answer yet".
4. Add it to the tool list asserted in the first test of [`tests/mcp.test.ts`](../tests/mcp.test.ts), and test what it does.
5. Mention it in the skill that should use it, and allow it in `.claude/settings.json` if it needs no confirmation (`mcp__aristotle` already allows all).

The tool appears in [architecture.md](architecture.md#mcp-tools) by itself (`pnpm docs:gen`).

## Add an API route

1. Add an `if (req.method === … && route === …)` line in `handleApi` in [`server/index.ts`](../server/index.ts). Answer with `json()`. The Host and Origin checks already apply.
2. For POST bodies use `readJson` and validate them by hand, as `/api/answer` does.
3. Fetch it from the interface; if what it returns can change while the page is open, emit an event from the store and handle it in [`feed.svelte.ts`](../ui/src/lib/feed.svelte.ts) instead of polling.

## Add a page

1. Add the route to the `Route` type, `parse` and `link` in [`router.svelte.ts`](../ui/src/lib/router.svelte.ts).
2. Add the page to `pages` in [`App.svelte`](../ui/src/App.svelte) (it loads on first visit) and create it in `ui/src/pages/`, starting with a comment saying what it is.
3. Link to it from the ribbon, the sidebar or wherever it belongs, and give it a tab label in [`TabBar.svelte`](../ui/src/lib/TabBar.svelte).

## Add a figure to the visual kit

A kit figure is a component that draws a fenced JSON block, so Claude can use it without writing SVG.

1. Create `ui/src/lib/kit/<Name>.svelte`, taking the parsed JSON as its `spec` prop; open it with a comment saying what it draws and that it is written as a ```` ```<lang> ```` block. Use tokens for every colour so it works in both themes.
2. Add `<lang>: () => import('./kit/<Name>.svelte')` to `KIT` in [`Markdown.svelte`](../ui/src/lib/Markdown.svelte).
3. Teach Claude its JSON: add it to the visual kit sentence in `MATH_AND_DIAGRAMS` in [`server/mcp.ts`](../server/mcp.ts), with every field.
4. Try it in the dev instance: have the `aristotle-dev` MCP server `show` a block, or add a step to [`scripts/fixtures/demo.ts`](../scripts/fixtures/demo.ts) and `pnpm seed --force`.

## Add a drawing to the flow's glyphs

A new molecule or particle for `art`, `carries` and `makes` goes in [`Glyph.svelte`](../ui/src/lib/kit/Glyph.svelte): a branch drawing it around (0, 0) with the `atom` and `bond` snippets, its half size in `EXTENT`, its formula in `NAMES`, and any other spellings in `ALIASES`. Then add its name to the list of drawings in the `flow` sentence of `MATH_AND_DIAGRAMS` in [`server/mcp.ts`](../server/mcp.ts).

## Add an explorable

An explorable is a hand-built interactive figure for one topic, placed in a lesson after the step that teaches its concept.

1. Create the component in `ui/src/lib/explorables/`.
2. Add an entry to `EXPLORABLES` in [`explorables/index.ts`](../ui/src/lib/explorables/index.ts): id, title, a one-line blurb, the topics and concepts it belongs to, and its loader.
3. Describe its id and options to Claude in `MATH_AND_DIAGRAMS` in [`server/mcp.ts`](../server/mcp.ts).

## Add a setting

1. Read it in [`server/config.ts`](../server/config.ts) from an `ARISTOTLE_*` variable with a default, and put a `/** comment */` above it: that comment is its documentation ([development.md](development.md#settings) is generated from it).
2. A per-install choice that the learner makes once (like the accent) belongs in `.aristotle/settings.json` instead, read in `readSettings`.

## Change the look

Change tokens in [`base.css`](../ui/src/styles/base.css) for both themes at once; never put a raw colour in a component. See [interface.md](interface.md).

## Change the method

Edit the skill in `.claude/skills/<name>/SKILL.md`. See [teaching.md](teaching.md) for how they fit together, and release it: lessons in the drawer use the released skills.
