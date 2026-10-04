<script lang="ts">
  import type { MapItem } from '../../../shared/types.ts';
  import { link } from './router.svelte.ts';

  let { item }: { item: MapItem } = $props();

  const WORD = { solid: 'solid', shaky: 'shaky', unknown: 'not yet' } as const;
</script>

<div class="map-update">
  <a class="label" href={link.topic(item.topic)}>Map</a>
  <ul>
    {#each item.changes as c (c.id)}
      <li>
        {#if c.removed}
          <span class="removed">{c.label}</span> removed
        {:else if c.added}
          <i class="dot {c.to}"></i><a href={link.topic(item.topic, c.id)}>{c.label}</a> added
        {:else if c.to}
          <i class="dot {c.to}"></i><a href={link.topic(item.topic, c.id)}>{c.label}</a>
          {#if c.from}<span class="from">{WORD[c.from]} →</span>{/if}
          <strong class="to {c.to}">{WORD[c.to]}</strong>
        {/if}
      </li>
    {/each}
  </ul>
</div>
