<script lang="ts">
  // A lesson as one long note: each entry a block in the reading column. Teaching steps are numbered in
  // order; map changes are quiet one-line notes between them.
  import type { PublicItem } from '../../../shared/types.ts';
  import Block from './Block.svelte';
  import Quiz from './Quiz.svelte';
  import Ask from './Ask.svelte';
  import MapUpdate from './MapUpdate.svelte';

  let {
    items,
    pendingId = null,
    readonly = false,
  }: { items: PublicItem[]; pendingId?: string | null; readonly?: boolean } = $props();

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
  {/each}
</ol>
