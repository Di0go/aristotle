<script lang="ts">
  import type { BlockItem } from '../../../shared/types.ts';
  import Markdown from './Markdown.svelte';

  let { item, number = 0 }: { item: BlockItem; number?: number } = $props();

  const LABELS: Record<BlockItem['kind'], string> = {
    orient: 'Before we start',
    step: 'Step',
    plan: 'The plan',
    summary: 'Summary',
    feedback: 'On your answer',
    note: 'Note',
  };

  /** "2. Wired and broadcast" is shown as "Wired and broadcast": the label already carries the number. */
  const title = $derived(item.title?.replace(/^\s*(step\s*)?\d+[.:)]\s*/i, ''));
  const label = $derived(item.kind === 'step' && number ? `Step ${number}` : LABELS[item.kind] ?? 'Note');
</script>

<article class="block kind-{item.kind}">
  <p class="kicker">{label}</p>
  {#if title}<h2 class="block-title">{title}</h2>{/if}
  <Markdown source={item.markdown} />
</article>
