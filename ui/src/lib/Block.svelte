<script lang="ts">
  import type { BlockItem } from '../../../shared/types.ts';
  import Markdown from './Markdown.svelte';

  let { item }: { item: BlockItem } = $props();

  const LABELS: Record<BlockItem['kind'], string> = {
    step: 'Step',
    plan: 'Plan',
    summary: 'Summary',
    feedback: 'Feedback',
    note: 'Note',
  };
</script>

<article class="card block kind-{item.kind}">
  <header class="card-head">
    <span class="label">{LABELS[item.kind]}</span>
    {#if item.title}<h2>{item.title}</h2>{/if}
  </header>
  <Markdown source={item.markdown} />
</article>
