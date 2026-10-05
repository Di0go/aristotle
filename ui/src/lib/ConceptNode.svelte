<script lang="ts">
  // One concept on a map: status by fill and outline, goal by an inner ring, focus by a halo.
  import { isFading } from '../../../shared/types.ts';
  import type { PlacedNode } from './layout.ts';

  const STATUS = { solid: 'solid', shaky: 'shaky', unknown: 'not yet' } as const;

  let {
    node,
    focused = false,
    selected = false,
    dim = false,
    ref = undefined,
    onclick,
    onhover,
  }: {
    node: PlacedNode;
    focused?: boolean;
    selected?: boolean;
    dim?: boolean;
    ref?: string;
    onclick?: () => void;
    onhover?: (on: boolean) => void;
  } = $props();

  const c = $derived(node.concept);
  const fading = $derived(isFading(c));
  /** Read out by screen readers: "Other topic: Label, shaky. Summary." */
  const title = $derived.by(() => {
    const where = node.external ? `${node.external.topicTitle}: ` : '';
    const state = fading ? 'solid but fading (due for review)' : STATUS[c.status];
    return `${where}${c.label}, ${state}${c.summary ? `. ${c.summary}` : ''}`;
  });

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
  class:dim
  transform="translate({node.x},{node.y})"
  data-concept={ref ?? (node.key.includes('/') ? node.key : undefined)}
  role={onclick ? 'button' : 'img'}
  aria-label={title}
  tabindex={onclick ? 0 : undefined}
  onclick={() => onclick?.()}
  onkeydown={onKey}
  onpointerenter={() => onhover?.(true)}
  onpointerleave={() => onhover?.(false)}
  onfocus={() => onhover?.(true)}
  onblur={() => onhover?.(false)}
>
  {#if focused}<rect class="halo" x="-6" y="-6" width={node.w + 12} height={node.h + 12} rx="11" />{/if}
  <rect class="box" width={node.w} height={node.h} rx="7" />
  {#if c.status === 'shaky'}<rect class="half" x="0.5" y="6" width={3} height={node.h - 12} rx="1.5" />{/if}
  {#if c.goal && !node.external}<rect class="goal-ring" x="3" y="3" width={node.w - 6} height={node.h - 6} rx="5" />{/if}
  <!-- Lines are 17px apart (layout.ts's LINE_H); the block of them is centred on the box. -->
  <text x={node.w / 2} y={node.h / 2 - ((node.lines.length - 1) * 17) / 2} text-anchor="middle">
    {#each node.lines as line, i (i)}<tspan x={node.w / 2} dy={i === 0 ? '0.35em' : '17'}>{line}</tspan>{/each}
  </text>
</g>
