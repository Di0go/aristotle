<script lang="ts">
  // One concept on a map: status by fill and outline, goal by an inner ring, focus by a halo.
  import { isFading } from '../../../shared/types.ts';
  import type { PlacedNode } from './layout.ts';

  let {
    node,
    focused = false,
    selected = false,
    onclick,
  }: { node: PlacedNode; focused?: boolean; selected?: boolean; onclick?: () => void } = $props();

  const c = $derived(node.concept);
  const fading = $derived(isFading(c));
  const STATUS = { solid: 'solid', shaky: 'shaky', unknown: 'not yet' } as const;
  const title = $derived(
    `${node.external ? `${node.external.topicTitle}: ` : ''}${c.label}, ${fading ? 'solid but fading (due for review)' : STATUS[c.status]}${c.summary ? `. ${c.summary}` : ''}`,
  );

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onclick?.();
    }
  }
</script>

<!-- Nodes are buttons (role and tabindex) exactly when they are clickable. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<g
  class="node {c.status}"
  class:goal={c.goal}
  class:fading
  class:focus={focused}
  class:selected
  class:external={node.external}
  class:clickable={Boolean(onclick)}
  transform="translate({node.x},{node.y})"
  role={onclick ? 'button' : undefined}
  tabindex={onclick ? 0 : undefined}
  onclick={() => onclick?.()}
  onkeydown={onKey}
>
  <title>{title}</title>
  {#if focused}<rect class="halo" x="-5" y="-5" width={node.w + 10} height={node.h + 10} rx="13" />{/if}
  <rect class="box" width={node.w} height={node.h} rx="9" />
  {#if c.goal && !node.external}<rect class="goal-ring" x="3" y="3" width={node.w - 6} height={node.h - 6} rx="6" />{/if}
  <text x={node.w / 2} y={node.h / 2} dominant-baseline="central" text-anchor="middle">{node.text}</text>
</g>
