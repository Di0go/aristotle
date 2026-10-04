<script lang="ts">
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
</script>

{#each items as item (item.id)}
  <div id="item-{item.id}" class="item item-{item.type}">
    {#if item.type === 'block'}
      <Block {item} />
    {:else if item.type === 'quiz'}
      <Quiz {item} active={pendingId === item.id} {readonly} />
    {:else if item.type === 'ask'}
      <Ask {item} active={pendingId === item.id} {readonly} />
    {:else}
      <MapUpdate {item} />
    {/if}
  </div>
{/each}
