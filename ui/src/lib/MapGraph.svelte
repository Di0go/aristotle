<script lang="ts">
  // A topic's knowledge map as a graph: concepts are nodes, arrows run from a prerequisite to what builds on it.
  // Prerequisites borrowed from other topics appear as outlined external nodes.
  import type { Topic } from '../../../shared/types.ts';
  import ConceptNode from './ConceptNode.svelte';
  import { layoutTopic } from './layout.ts';
  import { link } from './router.svelte.ts';

  let {
    topic,
    others = {},
    direction = 'LR',
    fit = false,
    selected = null,
    onselect,
  }: {
    topic: Topic;
    /** Other topics, for labelling borrowed prerequisites. */
    others?: Record<string, Topic>;
    direction?: 'LR' | 'TB';
    /** Scale the whole graph to the container's width instead of scrolling. */
    fit?: boolean;
    selected?: string | null;
    onselect?: (id: string) => void;
  } = $props();

  const layout = $derived(layoutTopic(topic, direction, others));

  // Focus and context: pointing at a concept lights it, what it builds on, and what builds on it.
  let hovered = $state<string | null>(null);
  const lit = $derived.by(() => {
    const key = hovered ?? selected;
    if (!key) return null;
    const set = new Set([key]);
    for (const e of layout.edges) {
      if (e.from === key) set.add(e.to);
      if (e.to === key) set.add(e.from);
    }
    return set;
  });
</script>

{#if topic.concepts.length === 0}
  <p class="map-empty">No concepts on the map yet.</p>
{:else}
  <div class="map-scroll" class:fit>
    <svg
      class="map"
      viewBox="0 0 {layout.width} {layout.height}"
      width={fit ? '100%' : layout.width}
      height={fit ? undefined : layout.height}
      role="img"
      aria-label="Knowledge map of {topic.title}"
    >
      <defs>
        <marker id="arrow-{topic.slug}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,1 L9,5 L0,9 z" class="arrow" />
        </marker>
      </defs>
      {#each layout.edges as edge (edge.key)}
        <path
          d={edge.d}
          class="edge"
          class:cross={edge.from.includes('/')}
          class:to-selected={edge.to === selected}
          class:dim={lit && !(lit.has(edge.from) && lit.has(edge.to) && (edge.from === (hovered ?? selected) || edge.to === (hovered ?? selected)))}
          marker-end="url(#arrow-{topic.slug})"
        />
      {/each}
      {#each layout.nodes as node (node.key)}
        <ConceptNode
          {node}
          focused={!node.external && topic.focus === node.key}
          selected={selected === node.key}
          ref={node.external ? node.key : `${topic.slug}/${node.key}`}
          dim={lit ? !lit.has(node.key) : false}
          onhover={(on) => (hovered = on ? node.key : hovered === node.key ? null : hovered)}
          onclick={node.external
            ? () => (location.hash = link.topic(node.external!.topic, node.concept.id))
            : onselect
              ? () => onselect(node.key)
              : undefined}
        />
      {/each}
    </svg>
  </div>
{/if}
