<script lang="ts">
  // One part of a class (the probe, the plan, a step with its checks, the summary) that folds to a single line:
  // what it is, and how its checks went. Folded parts render nothing, so a long class stays light.
  import FeedList from './FeedList.svelte';
  import type { Explorable } from './explorables/index.ts';
  import type { Section } from './sections.ts';

  let {
    section,
    open,
    ontoggle,
    figures = {},
  }: {
    section: Section;
    open: boolean;
    ontoggle: () => void;
    figures?: Record<string, Explorable[]>;
  } = $props();

  const c = $derived(section.checks);
  const graded = $derived(c.right + c.wrong + c.dontKnow);
</script>

<section id="part-{section.key}" class="part part-{section.kind}" class:open>
  <button class="part-head" aria-expanded={open} onclick={ontoggle}>
    <svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" /></svg>
    <span class="part-label">{section.label}</span>
    {#if section.title}<span class="part-title">{section.title}</span>{/if}
    <span class="tally">
      {#if graded}<span class:all={c.right === graded} title="{c.right} right, {c.wrong} wrong, {c.dontKnow} didn't know">{c.right}/{graded} right</span>{/if}
      {#if c.written}<span>{c.written} written</span>{/if}
      {#if c.unanswered}<span class="todo">{c.unanswered} to answer</span>{/if}
    </span>
  </button>
  {#if open}
    <div class="part-body">
      <FeedList items={section.items} readonly {figures} firstStep={section.step ?? 1} />
    </div>
  {/if}
</section>

<style>
  .part {
    max-width: var(--measure);
    margin: 0 auto;
    border-bottom: 1px solid var(--rule);
  }

  .part-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    width: 100%;
    padding: 14px 4px;
    border: 0;
    background: none;
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .part-head:hover {
    background: var(--hover);
  }

  .part-head:focus-visible {
    outline: 2px solid var(--acc);
    outline-offset: -2px;
  }

  .chev {
    flex: none;
    align-self: center;
    width: 14px;
    height: 14px;
    fill: none;
    stroke: var(--faint);
    stroke-width: 1.6;
    transition: transform 0.15s var(--ease);
  }

  .open .chev {
    transform: rotate(90deg);
  }

  .part-label {
    flex: none;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--muted);
  }

  .part-title {
    min-width: 0;
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tally {
    display: flex;
    gap: 12px;
    margin-left: auto;
    padding-left: 12px;
    font-size: 0.78rem;
    color: var(--faint);
    white-space: nowrap;
  }

  .tally .all {
    color: var(--solid);
  }

  .tally .todo {
    color: var(--acc);
    font-weight: 600;
  }

  .part-body {
    padding: 32px 0 8px;
  }

  /* The heading above already names the part: the block that opens it doesn't repeat its label and title. */
  .part:not(.part-probe, .part-notes) .part-body :global(.notebook > .entry:first-child > .block > .kicker),
  .part:not(.part-probe, .part-notes) .part-body :global(.notebook > .entry:first-child > .block > .block-title) {
    display: none;
  }

  /* Inside a part, entries sit closer than in the live lesson. */
  .part-body :global(.notebook > .entry) {
    margin-bottom: 56px;
    animation: none;
  }

  .part-body :global(.notebook > .entry-map) {
    margin: -40px 0 40px;
  }

  .part-body :global(.notebook > .entry-figure) {
    margin-top: -24px;
  }
</style>
