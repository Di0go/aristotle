<script lang="ts">
  // A map change, set as a small stamp in the notebook: what moved, and to where.
  import type { MapItem } from '../../../shared/types.ts';
  import { link } from './router.svelte.ts';

  let { item }: { item: MapItem } = $props();

  const WORD = { solid: 'solid', shaky: 'shaky', unknown: 'not yet' } as const;
  const added = $derived(item.changes.filter((c) => c.added));
  const moved = $derived(item.changes.filter((c) => !c.added && !c.removed && c.to));
  const removed = $derived(item.changes.filter((c) => c.removed));
</script>

<div class="stamp">
  <svg class="stamp-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="4" cy="4" r="2" /><circle cx="12" cy="6" r="2" /><circle cx="7" cy="12.5" r="2" /><path d="M5.6 5l4.6.6M5.2 6l1.3 4.6" /></svg>
  <div class="stamp-body">
    {#if moved.length}
      <p>
        {#each moved as c, i (c.id)}
          {#if i}{', '}{/if}<a href={link.topic(item.topic, c.id)}><i class="dot {c.to}"></i>{c.label}</a>
          <span class="to {c.to}">{c.from ? `${WORD[c.from]} → ` : ''}{WORD[c.to!]}</span>
        {/each}
      </p>
    {/if}
    {#if added.length}
      <p>
        <span class="muted">On the map:</span>
        {#each added as c, i (c.id)}
          {#if i}{', '}{/if}<a href={link.topic(item.topic, c.id)}>{c.label}</a>
        {/each}
      </p>
    {/if}
    {#if removed.length}
      <p class="muted">Removed: {removed.map((c) => c.label).join(', ')}</p>
    {/if}
  </div>
</div>
