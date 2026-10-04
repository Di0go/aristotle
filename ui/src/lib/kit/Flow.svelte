<script lang="ts">
  // A pathway: boxes and arrows laid out automatically, signals travelling along the arrows (fast or slow),
  // and optional steps that light up one part of it at a time. Written as a ```flow block of JSON.
  import dagre from '@dagrejs/dagre';
  import { labelBox, smooth } from '../layout.ts';

  interface FNode {
    id: string;
    label: string;
    /** A second line in small type, e.g. where it is or what it releases. */
    sub?: string;
  }
  interface FEdge {
    from: string;
    to: string;
    label?: string;
    /** "a": the main kind (accent); "b": the opposing kind; "slow": a slow route (dashed). */
    kind?: 'a' | 'b' | 'slow';
    speed?: 'fast' | 'slow';
  }
  interface FStep {
    caption: string;
    on: string[];
  }
  interface Spec {
    title?: string;
    direction?: 'LR' | 'TB';
    nodes: FNode[];
    edges: FEdge[];
    steps?: FStep[];
  }

  let { spec }: { spec: Spec } = $props();

  const uid = `f${Math.random().toString(36).slice(2, 8)}`;

  const layout = $derived.by(() => {
    // A multigraph: two arrows may join the same pair (the brake and the accelerator both reach the heart).
    const g = new dagre.graphlib.Graph({ multigraph: true });
    const dir = spec.direction ?? 'LR';
    g.setGraph({ rankdir: dir, nodesep: dir === 'LR' ? 34 : 46, ranksep: dir === 'LR' ? 150 : 80, marginx: 14, marginy: 22 });
    g.setDefaultEdgeLabel(() => ({}));
    const boxes = new Map<string, { w: number; h: number; lines: string[] }>();
    for (const n of spec.nodes) {
      const b = labelBox(n.label);
      const h = b.h + (n.sub ? 16 : 0) + 6;
      boxes.set(n.id, { ...b, w: Math.max(b.w + 16, n.sub ? n.sub.length * 6.2 + 28 : 0), h });
      g.setNode(n.id, { width: boxes.get(n.id)!.w, height: h });
    }
    spec.edges.forEach((e, i) => g.setEdge(e.from, e.to, { i }, `e${i}`));
    dagre.layout(g);
    const nodes = spec.nodes.map((n) => {
      const p = g.node(n.id);
      const b = boxes.get(n.id)!;
      return { ...n, x: p.x - b.w / 2, y: p.y - b.h / 2, w: b.w, h: b.h, lines: b.lines };
    });
    // Arrows that join the same pair would lie on top of each other: fan them out sideways.
    const pairs = new Map<string, number[]>();
    spec.edges.forEach((e, i) => pairs.set(`${e.from}>${e.to}`, [...(pairs.get(`${e.from}>${e.to}`) ?? []), i]));
    const edges = spec.edges.map((e, i) => {
      let pts = (g.edge({ v: e.from, w: e.to, name: `e${i}` })?.points ?? []).map((p: { x: number; y: number }) => ({ ...p }));
      const group = pairs.get(`${e.from}>${e.to}`)!;
      if (group.length > 1 && pts.length >= 2) {
        const k = group.indexOf(i) - (group.length - 1) / 2;
        const a = pts[0];
        const b = pts[pts.length - 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        const off = k * 46;
        const mid = { x: (a.x + b.x) / 2 + nx * off, y: (a.y + b.y) / 2 + ny * off };
        pts = [{ x: a.x + nx * off * 0.25, y: a.y + ny * off * 0.25 }, mid, { x: b.x + nx * off * 0.25, y: b.y + ny * off * 0.25 }];
      }
      const mid = pts[Math.floor(pts.length / 2)] ?? { x: 0, y: 0 };
      return { ...e, i, d: smooth(pts), mid };
    });
    const gr = g.graph();
    return { nodes, edges, w: Math.ceil(gr.width ?? 400), h: Math.ceil(gr.height ?? 200) };
  });

  let at = $state(-1);
  const steps = $derived(spec.steps ?? []);
  const lit = $derived(at >= 0 && steps[at] ? new Set(steps[at].on) : null);
  const edgeLit = (e: FEdge) => !lit || (lit.has(e.from) && lit.has(e.to));

  const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
</script>

<figure class="kit kit-flow">
  {#if spec.title}<p class="kit-title">{spec.title}</p>{/if}
  <div class="flow-scroll">
    <svg viewBox="0 0 {layout.w} {layout.h}" style:max-width="{Math.max(layout.w, 320)}px" style:min-width="{Math.min(layout.w, 520)}px" role="img" aria-label={spec.title ?? 'Diagram'}>
      <defs>
        <marker id="{uid}-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,1 L9,5 L0,9 z" class="arrowhead" />
        </marker>
      </defs>
      {#each layout.edges as e (e.i)}
        <path id="{uid}-e{e.i}" class="edge {e.kind ?? 'a'}" class:dim={!edgeLit(e)} d={e.d} marker-end="url(#{uid}-arr)" />
      {/each}
      {#each layout.edges as e (e.i)}
        {#if e.label}
          {@const w = e.label.length * 6.4 + 12}
          <g class="elabel" class:dim={!edgeLit(e)}>
            <rect x={e.mid.x - w / 2} y={e.mid.y - 10} width={w} height="20" rx="10" />
            <text x={e.mid.x} y={e.mid.y + 4} text-anchor="middle">{e.label}</text>
          </g>
        {/if}
        {#if !still && edgeLit(e)}
          <circle class="pulse {e.kind ?? 'a'}" r="4">
            <animateMotion dur={(e.speed ?? (e.kind === 'slow' ? 'slow' : 'fast')) === 'slow' ? '4.5s' : '1.6s'} repeatCount="indefinite" begin="{(e.i * 0.37) % 1.5}s">
              <mpath href="#{uid}-e{e.i}" />
            </animateMotion>
          </circle>
        {/if}
      {/each}
      {#each layout.nodes as n (n.id)}
        <g class="node" class:dim={lit && !lit.has(n.id)} class:on={lit?.has(n.id)} transform="translate({n.x},{n.y})">
          <rect width={n.w} height={n.h} rx="10" />
          <text x={n.w / 2} y={14 + (n.sub ? 0 : (n.h - 14 - n.lines.length * 17) / 2) + 12} text-anchor="middle">
            {#each n.lines as line, i (i)}<tspan x={n.w / 2} dy={i === 0 ? 0 : 17}>{line}</tspan>{/each}
          </text>
          {#if n.sub}<text class="sub" x={n.w / 2} y={n.h - 10} text-anchor="middle">{n.sub}</text>{/if}
        </g>
      {/each}
    </svg>
  </div>
  {#if steps.length}
    <div class="kit-steps">
      <button class="ghost small" onclick={() => (at = Math.max(-1, at - 1))} disabled={at < 0}>Back</button>
      <div class="kit-ticks">
        {#each steps as _, i (i)}<button class:seen={i <= at} aria-label="Step {i + 1}" onclick={() => (at = i)}></button>{/each}
      </div>
      <button class="primary small" onclick={() => (at = Math.min(steps.length - 1, at + 1))} disabled={at === steps.length - 1}>{at < 0 ? 'Walk through' : 'Next'}</button>
    </div>
    <p class="kit-note" aria-live="polite">{at >= 0 ? steps[at].caption : 'The whole pathway. Walk through it one part at a time.'}</p>
  {/if}
</figure>

<style>
  .flow-scroll {
    overflow-x: auto;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    margin: 0 auto;
  }

  .edge {
    fill: none;
    stroke-width: 2;
    transition: opacity 0.3s;
  }

  .edge.a {
    stroke: var(--acc);
  }

  .edge.b {
    stroke: var(--kit-b);
  }

  .edge.slow {
    stroke: var(--muted);
    stroke-dasharray: 6 5;
  }

  .arrowhead {
    fill: var(--muted);
  }

  .pulse.a {
    fill: var(--acc);
  }

  .pulse.b {
    fill: var(--kit-b);
  }

  .pulse.slow {
    fill: var(--muted);
  }

  .elabel rect {
    fill: var(--b0);
    stroke: var(--rule);
  }

  .elabel text {
    fill: var(--fg-2);
    font: 500 11px var(--sans);
  }

  .node rect {
    fill: var(--b1);
    stroke: var(--rule-strong);
    stroke-width: 1.2;
    transition: stroke 0.3s, fill 0.3s;
  }

  .node.on rect {
    stroke: var(--fg);
    fill: var(--b0);
  }

  .node text {
    fill: var(--fg);
    font: 600 13px var(--sans);
  }

  .node .sub {
    fill: var(--faint);
    font: 11px var(--sans);
  }

  .dim {
    opacity: 0.18;
  }

  .node {
    transition: opacity 0.3s;
  }
</style>
