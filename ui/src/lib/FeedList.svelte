<script lang="ts">
  // A lesson as one long note: each entry a block in the reading column. Teaching steps are numbered in
  // order; map changes are quiet one-line notes between them.
  import Ask from './Ask.svelte';
  import Block from './Block.svelte';
  import { feed } from './feed.svelte.ts';
  import MapUpdate from './MapUpdate.svelte';
  import Quiz from './Quiz.svelte';
  import type { Component } from 'svelte';
  import type { Explorable } from './explorables/index.ts';
  import type { PublicItem } from '../../../shared/types.ts';

  let {
    items,
    pendingId = null,
    readonly = false,
    figures = {},
    firstStep = 1,
  }: {
    items: PublicItem[];
    pendingId?: string | null;
    readonly?: boolean;
    /** Interactive figures to place after an item (by item id), where the step they explain is. */
    figures?: Record<string, Explorable[]>;
    /** The number of the first teaching step here, when this is one part of a longer class. */
    firstStep?: number;
  } = $props();

  /**
   * The latest session's items, live. A question of it still waiting for him can be answered even where the rest is
   * read back (a class, a past session), and shows his answer as soon as it is sent.
   */
  const live = $derived(new Map(feed.items.map((x) => [x.id, x])));

  /** Each item's step number, counted across the items (0 for anything that is not a teaching step). */
  const numbers = $derived.by(() => {
    let step = firstStep - 1;
    return items.map((item) => (item.type === 'block' && item.kind === 'step' ? ++step : 0));
  });
</script>

<ol class="notebook">
  {#each items as item, i (item.id)}
    <li id="item-{item.id}" class="entry entry-{item.type}" class:pending={pendingId === item.id}>
      <!-- One entry that can't be shown (bad content in a stored block) never takes the rest of the page with it. -->
      <svelte:boundary onerror={(error) => console.error('Could not show this entry', error)}>
        {#if item.type === 'block'}
          <Block {item} number={numbers[i]} />
        {:else if item.type === 'quiz' || item.type === 'ask'}
          {@const current = (live.get(item.id) ?? item) as typeof item}
          {@const locked = readonly && (Boolean(current.answeredAt) || !live.has(item.id))}
          {#if current.type === 'quiz'}
            <Quiz item={current} active={pendingId === item.id} readonly={locked} />
          {:else}
            <Ask item={current} active={pendingId === item.id} readonly={locked} />
          {/if}
        {:else}
          <MapUpdate {item} />
        {/if}
        {#snippet failed(_, retry)}
          <p class="entry-failed">This part couldn't be shown. <button class="link" onclick={retry}>Try again</button></p>
        {/snippet}
      </svelte:boundary>
    </li>
    {#each figures[item.id] ?? [] as fig (fig.id)}
      <li class="entry entry-figure">
        <p class="kicker">Try it</p>
        {#await fig.load()}
          <div class="figure-loading"></div>
        {:then m}
          {@const Figure = m.default as Component<{ spec: Record<string, unknown> }>}
          <Figure spec={{}} />
        {/await}
      </li>
    {/each}
  {/each}
</ol>
