<script lang="ts">
  // A lesson as one long note: each entry a block in the reading column. Teaching steps are numbered in
  // order; map changes are quiet one-line notes between them.
  import type { PublicItem } from '../../../shared/types.ts';
  import Block from './Block.svelte';
  import Quiz from './Quiz.svelte';
  import Ask from './Ask.svelte';
  import MapUpdate from './MapUpdate.svelte';
  import type { Component } from 'svelte';
  import type { Explorable } from './explorables/index.ts';

  let {
    items,
    pendingId = null,
    readonly = false,
    figures = {},
  }: {
    items: PublicItem[];
    pendingId?: string | null;
    readonly?: boolean;
    /** Interactive figures to place after an item (by item id), where the step they explain is. */
    figures?: Record<string, Explorable[]>;
  } = $props();

  const numbers = $derived.by(() => {
    let step = 0;
    return items.map((item) => (item.type === 'block' && item.kind === 'step' ? ++step : 0));
  });
</script>

<ol class="notebook">
  {#each items as item, i (item.id)}
    <li id="item-{item.id}" class="entry entry-{item.type}" class:pending={pendingId === item.id}>
      {#if item.type === 'block'}
        <Block {item} number={numbers[i]} />
      {:else if item.type === 'quiz'}
        <Quiz {item} active={pendingId === item.id} {readonly} />
      {:else if item.type === 'ask'}
        <Ask {item} active={pendingId === item.id} {readonly} />
      {:else}
        <MapUpdate {item} />
      {/if}
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
