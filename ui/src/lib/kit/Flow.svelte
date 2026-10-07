<script lang="ts">
  // A pathway: boxes and arrows laid out automatically, signals travelling along the arrows (fast or slow),
  // optional drawings of what is in each box, travels each arrow or comes out of a box, and optional steps that
  // light up one part of it at a time. Written as a ```flow block of JSON.
  import dagre from '@dagrejs/dagre';
  import { LINE_H, labelBox, smooth } from '../layout.ts';
  import Glyph, { glyphExtent } from './Glyph.svelte';
  import { whileVisible } from '../visible.ts';

  interface FNode {
    id: string;
    label: string;
    /** A second line in small type, e.g. where it is or what it releases. */
    sub?: string;
    /** A drawing above the label: a molecule or particle from Glyph.svelte ("glucose", "o2"), or a short name as a chip. */
    art?: string;
    /** What comes out of the box, drawn rising from it while it is lit ("atp", "co2"). */
    makes?: string[];
  }
  interface FEdge {
    from: string;
    to: string;
    label?: string;
    /** "a": the main kind (accent); "b": the opposing kind; "slow": a slow route (dashed). */
    kind?: 'a' | 'b' | 'slow';
    speed?: 'fast' | 'slow';
    /** What travels the arrow, drawn in place of the plain pulse ("electron", "pyruvate", "nadh"). */
    carries?: string;
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

  /** Ids for the arrowhead marker and the edge paths the pulses ride, unique per figure on the page. */
  const uid = `f${Math.random().toString(36).slice(2, 8)}`;
  const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Estimated text widths (px per character) for the sub line and the edge labels, so boxes fit their text.
  const SUB_CHAR_W = 6.2;
  const EDGE_CHAR_W = 6.4;
  /** How far apart arrows that join the same pair are fanned, in px. */
  const FAN = 46;
  // A pulse takes this long to travel its arrow; starts are staggered within PULSE_STAGGER_S so they don't march in step.
  const PULSE_FAST = '1.6s';
  const PULSE_SLOW = '4.5s';
  const PULSE_STAGGER_S = 1.5;
  /** The height a box's drawing takes above its label, and the size it is fitted to. */
  const ART_H = 58;
  const ART_FIT = { w: 84, h: 46 };
  /** What comes out of a box rises this far while it fades, over RISE_S, one after another. */
  const RISE_PX = 34;
  const RISE_S = 2.4;
  /** Things carried on an arrow are drawn at this scale; two ride it at once, half a trip apart. */
  const CARRY_SCALE = 1.05;

  let at = $state(-1);
  let drawing = $state<SVGSVGElement>();

  // The signals travel only while the figure can be seen: out of sight (scrolled away, the tab hidden) they pause.
  $effect(() => {
    const svg = drawing;
    if (!svg || still) return;
    return whileVisible(svg, (visible) => (visible ? svg.unpauseAnimations() : svg.pauseAnimations()));
  });

  const steps = $derived(spec.steps ?? []);
  const lit = $derived(at >= 0 && steps[at] ? new Set(steps[at].on) : null);

  const layout = $derived.by(() => {
    // A multigraph: two arrows may join the same pair (the brake and the accelerator both reach the heart).
    const g = new dagre.graphlib.Graph({ multigraph: true });
    const dir = spec.direction ?? 'LR';
    // Room above the boxes for what rises out of them.
    const rising = spec.nodes.some((n) => n.makes?.length);
    const carrying = spec.edges.some((e) => e.carries);
    g.setGraph({
      rankdir: dir,
      nodesep: dir === 'LR' ? 34 : 46,
      ranksep: dir === 'LR' ? (carrying ? 190 : 150) : carrying ? 110 : 80,
      marginx: 14,
      marginy: rising ? 66 : 22,
    });
    g.setDefaultEdgeLabel(() => ({}));
    const boxes = new Map<string, { w: number; h: number; lines: string[] }>();
    for (const n of spec.nodes) {
      const b = labelBox(n.label);
      const h = b.h + (n.sub ? 16 : 0) + 6 + (n.art ? ART_H : 0);
      boxes.set(n.id, { ...b, w: Math.max(b.w + 16, n.sub ? n.sub.length * SUB_CHAR_W + 28 : 0, n.art ? ART_FIT.w + 24 : 0), h });
      g.setNode(n.id, { width: boxes.get(n.id)!.w, height: h });
    }
    spec.edges.forEach((e, i) => g.setEdge(e.from, e.to, { i }, `e${i}`));
    dagre.layout(g);
    const nodes = spec.nodes.map((n) => {
      const p = g.node(n.id);
      const b = boxes.get(n.id)!;
      return { ...n, x: p.x - b.w / 2, y: p.y - b.h / 2, w: b.w, h: b.h, lines: b.lines };
    });
    // Arrows that join the same pair would lie on top of each other: fan them out sideways. Each is redrawn
    // through a midpoint pushed along the normal to the straight line between its ends (k steps either side
    // of centre), with its ends nudged a quarter as far so they leave the boxes apart too.
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
        const off = k * FAN;
        const mid = { x: (a.x + b.x) / 2 + nx * off, y: (a.y + b.y) / 2 + ny * off };
        pts = [{ x: a.x + nx * off * 0.25, y: a.y + ny * off * 0.25 }, mid, { x: b.x + nx * off * 0.25, y: b.y + ny * off * 0.25 }];
      }
      const mid = pts[Math.floor(pts.length / 2)] ?? { x: 0, y: 0 };
      return { ...e, i, d: smooth(pts), mid };
    });
    const gr = g.graph();
    return { nodes, edges, w: Math.ceil(gr.width ?? 400), h: Math.ceil(gr.height ?? 200) };
  });

  /** An arrow stays lit while a step lights both its ends (or no step is on). */
  function edgeLit(e: FEdge): boolean {
    return !lit || (lit.has(e.from) && lit.has(e.to));
  }

  /** The scale that fits a box's drawing into its space, never above 1. */
  function artScale(name: string): number {
    const [hw, hh] = glyphExtent(name);
    return Math.min(1.5, ART_FIT.w / (2 * hw), ART_FIT.h / (2 * hh));
  }

  /** A node's text starts below its drawing, if it has one. */
  function top(n: { art?: string }): number {
    return n.art ? ART_H : 0;
  }

  function pulseDur(e: FEdge): string {
    return (e.speed ?? (e.kind === 'slow' ? 'slow' : 'fast')) === 'slow' ? PULSE_SLOW : PULSE_FAST;
  }
</script>

<figure class="kit kit-flow">
  {#if spec.title}<p class="kit-title">{spec.title}</p>{/if}
  <div class="flow-scroll">
    <svg
      bind:this={drawing}
      viewBox="0 0 {layout.w} {layout.h}"
      style:max-width="{Math.max(layout.w, 320)}px"
      style:min-width="{Math.min(layout.w, 520)}px"
      role="img"
      aria-label={spec.title ?? 'Diagram'}
    >
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
          {@const w = e.label.length * EDGE_CHAR_W + 12}
          <!-- With something riding the arrow, its label moves above it out of the way. -->
          {@const ly = e.mid.y - (e.carries ? 28 : 0)}
          <g class="elabel" class:dim={!edgeLit(e)} class:lifted={e.carries}>
            <rect x={e.mid.x - w / 2} y={ly - 10} width={w} height="20" rx="10" />
            <text x={e.mid.x} y={ly + 4} text-anchor="middle">{e.label}</text>
          </g>
        {/if}
        {#if e.carries && edgeLit(e)}
          {#if still}
            <g class="carried" transform="translate({e.mid.x},{e.mid.y})"><Glyph name={e.carries} scale={CARRY_SCALE} /></g>
          {:else}
            {#each [0, 0.5] as half (half)}
              <g class="carried">
                <Glyph name={e.carries} scale={CARRY_SCALE} />
                <animateMotion
                  dur={pulseDur(e) === PULSE_FAST ? '2.6s' : PULSE_SLOW}
                  repeatCount="indefinite"
                  begin="{-(half * (pulseDur(e) === PULSE_FAST ? 2.6 : 4.5)) - ((e.i * 0.37) % PULSE_STAGGER_S)}s"
                >
                  <mpath href="#{uid}-e{e.i}" />
                </animateMotion>
              </g>
            {/each}
          {/if}
        {:else if !still && edgeLit(e)}
          <circle class="pulse {e.kind ?? 'a'}" r="4">
            <animateMotion dur={pulseDur(e)} repeatCount="indefinite" begin="{(e.i * 0.37) % PULSE_STAGGER_S}s">
              <mpath href="#{uid}-e{e.i}" />
            </animateMotion>
          </circle>
        {/if}
      {/each}
      {#each layout.nodes as n (n.id)}
        <g class="node" class:dim={lit && !lit.has(n.id)} class:on={lit?.has(n.id)} transform="translate({n.x},{n.y})">
          <rect width={n.w} height={n.h} rx="10" />
          {#if n.art}<Glyph name={n.art} x={n.w / 2} y={ART_H / 2 + 6} scale={artScale(n.art)} />{/if}
          <!-- Without a sub line the label is centred vertically; with one it sits at the top (below any drawing). -->
          <text x={n.w / 2} y={top(n) + 14 + (n.sub ? 0 : (n.h - top(n) - 14 - n.lines.length * LINE_H) / 2) + 12} text-anchor="middle">
            {#each n.lines as line, i (i)}<tspan x={n.w / 2} dy={i === 0 ? 0 : LINE_H}>{line}</tspan>{/each}
          </text>
          {#if n.sub}<text class="sub" x={n.w / 2} y={n.h - 10} text-anchor="middle">{n.sub}</text>{/if}
        </g>
      {/each}
      <!-- What each lit box makes, rising out of its top edge and fading, one after another. -->
      {#each layout.nodes as n (n.id)}
        {#if n.makes?.length && (!lit || lit.has(n.id))}
          {#each n.makes as made, k (k)}
            {@const x = n.x + n.w * ((k + 1) / (n.makes.length + 1))}
            {#if still}
              <g transform="translate({x},{n.y - 22})"><Glyph name={made} scale={0.95} caption /></g>
            {:else}
              <g class="made" opacity="0">
                <Glyph name={made} {x} y={n.y - 14} scale={0.95} caption />
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  from="0 0"
                  to="0 -{RISE_PX}"
                  dur="{RISE_S}s"
                  begin="{(k * RISE_S) / n.makes.length}s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0;1;1;0"
                  keyTimes="0;0.2;0.7;1"
                  dur="{RISE_S}s"
                  begin="{(k * RISE_S) / n.makes.length}s"
                  repeatCount="indefinite"
                />
              </g>
            {/if}
          {/each}
        {/if}
      {/each}
    </svg>
  </div>
  {#if steps.length}
    <div class="kit-steps">
      <button class="ghost small" onclick={() => (at = Math.max(-1, at - 1))} disabled={at < 0}>Back</button>
      <div class="kit-ticks">
        {#each steps as _, i (i)}<button class:seen={i <= at} aria-label="Step {i + 1}" onclick={() => (at = i)}></button>{/each}
      </div>
      <button class="primary small" onclick={() => (at = Math.min(steps.length - 1, at + 1))} disabled={at === steps.length - 1}
        >{at < 0 ? 'Walk through' : 'Next'}</button
      >
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

  .elabel.lifted rect {
    stroke: none;
    fill: transparent;
  }

  .elabel text {
    fill: var(--fg-2);
    font: 500 11px var(--sans);
  }

  .node {
    transition: opacity 0.3s;
  }

  .node rect {
    fill: var(--b1);
    stroke: var(--rule-strong);
    stroke-width: 1.2;
    transition:
      stroke 0.3s,
      fill 0.3s;
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

  /* Whatever the current step leaves out. */
  .dim {
    opacity: 0.18;
  }
</style>
