<script lang="ts">
  // A topic's knowledge map as a graph: concepts are nodes, prerequisites point to what builds on them.
  import dagre from '@dagrejs/dagre';
  import { isFading, type Concept, type Topic } from '../../../shared/types.ts';

  let {
    topic,
    direction = 'LR',
    fit = false,
    selected = null,
    onselect,
  }: {
    topic: Topic;
    direction?: 'LR' | 'TB';
    /** Scale the whole graph to the container's width instead of scrolling. */
    fit?: boolean;
    selected?: string | null;
    onselect?: (id: string) => void;
  } = $props();

  const NODE_H = 34;
  const CHAR_W = 7.1;

  interface Placed {
    concept: Concept;
    x: number;
    y: number;
    w: number;
    h: number;
    text: string;
  }

  function labelWidth(label: string): { w: number; text: string } {
    const max = 26;
    const text = label.length > max ? `${label.slice(0, max - 1)}…` : label;
    return { w: Math.max(64, Math.round(text.length * CHAR_W + 26)), text };
  }

  const layout = $derived.by(() => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: direction, nodesep: direction === 'LR' ? 14 : 18, ranksep: direction === 'LR' ? 44 : 36, marginx: 10, marginy: 10 });
    g.setDefaultEdgeLabel(() => ({}));
    const ids = new Set(topic.concepts.map((c) => c.id));
    const sizes = new Map<string, { w: number; text: string }>();
    for (const c of topic.concepts) {
      const s = labelWidth(c.label);
      sizes.set(c.id, s);
      g.setNode(c.id, { width: s.w, height: NODE_H });
    }
    for (const c of topic.concepts) for (const d of c.deps) if (ids.has(d)) g.setEdge(d, c.id);
    dagre.layout(g);

    const nodes: Placed[] = topic.concepts.map((c) => {
      const n = g.node(c.id);
      const s = sizes.get(c.id)!;
      return { concept: c, x: n.x - s.w / 2, y: n.y - NODE_H / 2, w: s.w, h: NODE_H, text: s.text };
    });
    const edges = g.edges().map((e) => ({ key: `${e.v}->${e.w}`, to: e.w, d: smooth(g.edge(e).points ?? []) }));
    const graph = g.graph();
    return { nodes, edges, width: Math.ceil(graph.width ?? 0), height: Math.ceil(graph.height ?? 0) };
  });

  /** A path through dagre's points, rounded at the bends. */
  function smooth(points: { x: number; y: number }[]): string {
    if (points.length === 0) return '';
    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i];
      const n = points[i + 1];
      d += ` Q${p.x},${p.y} ${(p.x + n.x) / 2},${(p.y + n.y) / 2}`;
    }
    const last = points[points.length - 1];
    return `${d} L${last.x},${last.y}`;
  }

  function onKey(e: KeyboardEvent, id: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onselect?.(id);
    }
  }

  const STATUS_TEXT = { solid: 'solid', shaky: 'shaky', unknown: 'not yet' } as const;
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
        <path d={edge.d} class="edge" class:to-selected={edge.to === selected} marker-end="url(#arrow-{topic.slug})" />
      {/each}
      {#each layout.nodes as n (n.concept.id)}
        <!-- Nodes are buttons (role and tabindex) exactly when they are clickable. -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <g
          class="node {n.concept.status}"
          class:goal={n.concept.goal}
          class:fading={isFading(n.concept)}
          class:focus={topic.focus === n.concept.id}
          class:selected={selected === n.concept.id}
          class:clickable={Boolean(onselect)}
          transform="translate({n.x},{n.y})"
          role={onselect ? 'button' : undefined}
          tabindex={onselect ? 0 : undefined}
          onclick={() => onselect?.(n.concept.id)}
          onkeydown={(e) => onKey(e, n.concept.id)}
        >
          <title>{n.concept.label}: {isFading(n.concept) ? 'solid, fading (due for review)' : STATUS_TEXT[n.concept.status]}{n.concept.summary ? `. ${n.concept.summary}` : ''}</title>
          {#if topic.focus === n.concept.id}<rect class="halo" x="-5" y="-5" width={n.w + 10} height={n.h + 10} rx="13" />{/if}
          <rect class="box" width={n.w} height={n.h} rx="9" />
          {#if n.concept.goal}<rect class="goal-ring" x="3" y="3" width={n.w - 6} height={n.h - 6} rx="6" />{/if}
          <text x={n.w / 2} y={n.h / 2} dominant-baseline="central" text-anchor="middle">{n.text}</text>
        </g>
      {/each}
    </svg>
  </div>
{/if}
