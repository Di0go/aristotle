<script lang="ts">
  // The neighbourhood of one concept: it in the middle, what it builds on above, what builds on it below.
  // Nodes link to their concept and show the hover preview.
  import type { Topic } from '../../../shared/types.ts';
  import { link } from './router.svelte.ts';
  import { markOf } from './library.ts';

  let { topic, focus, others = {} }: { topic: Topic; focus: string; others?: Record<string, Topic> } = $props();

  interface N {
    /** Characters the label may use, from the room the node has in its row. */
    room: number;
    key: string;
    slug: string;
    id: string;
    label: string;
    mark: string;
    x: number;
    y: number;
  }

  const W = 260;
  const H = 190;

  const graph = $derived.by(() => {
    const center = topic.concepts.find((c) => c.id === focus);
    if (!center) return null;
    const find = (ref: string) => {
      const [a, b] = ref.includes('/') ? ref.split('/') : [topic.slug, ref];
      const t = a === topic.slug ? topic : others[a];
      const c = t?.concepts.find((x) => x.id === b);
      return c && t ? { slug: t.slug, c } : null;
    };
    const up = center.deps.map(find).filter((x) => x !== null).slice(0, 4);
    const down = topic.concepts.filter((c) => c.deps.includes(center.id)).slice(0, 4).map((c) => ({ slug: topic.slug, c }));
    const place = (row: { slug: string; c: (typeof topic.concepts)[number] }[], y: number): N[] =>
      row.map(({ slug, c }, i) => ({
        room: Math.max(8, Math.floor(W / row.length / 6.2)),
        key: `${slug}/${c.id}`,
        slug,
        id: c.id,
        label: c.label,
        mark: markOf(c),
        x: ((i + 1) * W) / (row.length + 1),
        y,
      }));
    const mid: N = { room: 30, key: `${topic.slug}/${center.id}`, slug: topic.slug, id: center.id, label: center.label, mark: markOf(center), x: W / 2, y: H / 2 };
    return { mid, up: place(up, 30), down: place(down, H - 30) };
  });

  function short(s: string, room: number): string {
    return s.length > room ? `${s.slice(0, room - 1)}…` : s;
  }
</script>

{#if graph}
  <svg class="local" viewBox="0 0 {W} {H}" role="img" aria-label="Concepts around {graph.mid.label}">
    {#each [...graph.up, ...graph.down] as n (n.key)}
      <line x1={graph.mid.x} y1={graph.mid.y} x2={n.x} y2={n.y} />
    {/each}
    {#each [...graph.up, ...graph.down] as n (n.key)}
      <a href={link.topic(n.slug, n.id)} data-concept={n.key}>
        <circle class="n {n.mark}" cx={n.x} cy={n.y} r="5" />
        <text x={n.x} y={n.y < H / 2 ? n.y - 10 : n.y + 17} text-anchor="middle">{short(n.label, n.room)}</text>
      </a>
    {/each}
    <a href={link.topic(graph.mid.slug, graph.mid.id)} data-concept={graph.mid.key}>
      <circle class="mid" cx={graph.mid.x} cy={graph.mid.y} r="8" />
      <text class="mid-t" x={graph.mid.x} y={graph.mid.y + 22} text-anchor="middle">{short(graph.mid.label, graph.mid.room)}</text>
    </a>
  </svg>
{/if}

<style>
  .local {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }

  line {
    stroke: var(--rule-strong);
    stroke-width: 1.2;
  }

  .n {
    fill: var(--b0);
    stroke: var(--faint);
    stroke-width: 1.5;
  }

  .n.solid,
  .n.fading {
    fill: var(--muted);
    stroke: var(--muted);
  }

  .n.shaky {
    fill: color-mix(in srgb, var(--muted) 50%, var(--b0));
    stroke: var(--muted);
  }

  .mid {
    fill: var(--acc);
  }

  text {
    fill: var(--faint);
    font: 10.5px var(--sans);
  }

  .mid-t {
    fill: var(--fg);
    font-weight: 500;
  }

  a:hover text {
    fill: var(--fg);
  }
</style>
