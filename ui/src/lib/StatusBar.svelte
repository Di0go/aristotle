<script lang="ts">
  import type { ConceptStatus } from '../../../shared/types.ts';

  let { counts, legend = false }: { counts: Record<ConceptStatus, number>; legend?: boolean } = $props();

  const total = $derived(counts.solid + counts.shaky + counts.unknown);
</script>

{#if total > 0}
  <div class="status-bar" role="img" aria-label="{counts.solid} solid, {counts.shaky} shaky, {counts.unknown} not yet">
    <span class="seg solid" style:flex-grow={counts.solid}></span>
    <span class="seg shaky" style:flex-grow={counts.shaky}></span>
    <span class="seg unknown" style:flex-grow={counts.unknown}></span>
  </div>
  {#if legend}
    <div class="legend">
      <span><i class="dot solid"></i>{counts.solid} solid</span>
      <span><i class="dot shaky"></i>{counts.shaky} shaky</span>
      <span><i class="dot unknown"></i>{counts.unknown} not yet</span>
    </div>
  {/if}
{/if}
