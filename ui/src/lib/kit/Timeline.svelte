<script lang="ts">
  // Things that happen over time, on one axis (logarithmic when they span seconds to hours). A playhead
  // sweeps across and each lane fills as time reaches it; drag on the chart to scrub.
  // Written as a ```timeline block of JSON.
  import { Tween } from 'svelte/motion';
  import { linear } from 'svelte/easing';

  interface Lane {
    label: string;
    start: string;
    end: string;
    /** When it is strongest, if that matters (drawn as a dot). */
    peak?: string;
    note?: string;
  }
  interface Spec {
    title?: string;
    scale?: 'log' | 'linear';
    from: string;
    to: string;
    marks?: string[];
    lanes: Lane[];
  }

  let { spec }: { spec: Spec } = $props();

  /** "300ms", "2s", "5 min", "1.5h", "2d" -> seconds. */
  function secs(v: string): number {
    const m = /^\s*([\d.]+)\s*(ms|s|sec|min|m|h|hr|d)?\s*$/i.exec(v);
    if (!m) return Number(v) || 0;
    const n = Number(m[1]);
    const u = (m[2] ?? 's').toLowerCase();
    return u === 'ms' ? n / 1000 : u === 'min' || u === 'm' ? n * 60 : u === 'h' || u === 'hr' ? n * 3600 : u === 'd' ? n * 86400 : n;
  }

  const log = $derived((spec.scale ?? 'log') === 'log');
  const t0 = $derived(Math.max(secs(spec.from), log ? 0.001 : 0));
  const t1 = $derived(secs(spec.to));
  const pos = (t: number) => {
    const c = Math.min(t1, Math.max(t0, t));
    return log ? (Math.log(c) - Math.log(t0)) / (Math.log(t1) - Math.log(t0)) : (c - t0) / (t1 - t0);
  };
  const timeAt = (p: number) => (log ? Math.exp(Math.log(t0) + p * (Math.log(t1) - Math.log(t0))) : t0 + p * (t1 - t0));

  function human(t: number): string {
    if (t < 1) return `${Math.round(t * 1000)} ms`;
    if (t < 60) return `${t < 10 ? Math.round(t * 10) / 10 : Math.round(t)} s`;
    if (t < 3600) return `${Math.round(t / 6) / 10} min`;
    return `${Math.round(t / 360) / 10} h`;
  }

  const L = 178;
  const RW = 362;
  const ROW = 40;
  const TOP = 24;
  const height = $derived(TOP + spec.lanes.length * ROW + 46);
  const x = (p: number) => L + p * RW;

  const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const head = new Tween(still ? 1 : 0, { duration: 0, easing: linear });
  let playing = $state(false);

  function play() {
    if (head.current >= 0.999) head.set(0, { duration: 0 });
    playing = true;
    void head.set(1, { duration: 7000 * (1 - head.current) }).then(() => (playing = false));
  }

  function pause() {
    playing = false;
    head.set(head.current, { duration: 0 });
  }

  let svg = $state<SVGSVGElement>();
  function scrub(e: PointerEvent) {
    if (!svg || (e.type === 'pointermove' && e.buttons !== 1)) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * 560;
    playing = false;
    head.set(Math.min(1, Math.max(0, (px - L) / RW)), { duration: 0 });
  }

  // Start once the figure scrolls into view.
  let root = $state<HTMLElement>();
  $effect(() => {
    if (!root || still) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        play();
        io.disconnect();
      }
    }, { threshold: 0.5 });
    io.observe(root);
    return () => io.disconnect();
  });

  const now = $derived(timeAt(head.current));
</script>

<figure class="kit kit-timeline" bind:this={root}>
  {#if spec.title}<p class="kit-title">{spec.title}</p>{/if}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <svg
    bind:this={svg}
    viewBox="0 0 560 {height}"
    role="img"
    aria-label="Timeline from {spec.from} to {spec.to}"
    onpointerdown={scrub}
    onpointermove={scrub}
  >
    {#each spec.marks ?? [] as m (m)}
      {@const mx = x(pos(secs(m)))}
      <line class="grid" x1={mx} y1={TOP - 8} x2={mx} y2={height - 34} />
      <text class="mark" x={mx} y={height - 16} text-anchor="middle">{m}</text>
    {/each}
    <line class="axis" x1={L} y1={height - 34} x2={L + RW} y2={height - 34} />

    {#each spec.lanes as lane, i (i)}
      {@const y = TOP + i * ROW}
      {@const a = pos(secs(lane.start))}
      {@const b = pos(secs(lane.end))}
      {@const reached = Math.min(b, Math.max(a, head.current))}
      {@const active = head.current >= a}
      <text class="lane" class:active x={L - 14} y={y + 15} text-anchor="end">{lane.label}</text>
      <rect class="bar-bg" x={x(a)} y={y + 6} width={Math.max(4, (b - a) * RW)} height="12" rx="6" />
      {#if active}<rect class="bar" class:alt={i % 2 === 1} x={x(a)} y={y + 6} width={Math.max(4, (reached - a) * RW)} height="12" rx="6" />{/if}
      {#if lane.peak}
        {@const pk = pos(secs(lane.peak))}
        <circle class="peak" class:on={head.current >= pk} cx={x(pk)} cy={y + 12} r="5" />
      {/if}
      <!-- A lane in the right half has its note end where the bar ends, so the note stays inside the figure. -->
      {#if lane.note && active}<text class="lane-note" x={a > 0.5 ? x(b) : x(a)} text-anchor={a > 0.5 ? 'end' : 'start'} y={y + 33}>{lane.note}</text>{/if}
    {/each}

    <line class="head" x1={x(head.current)} y1={TOP - 10} x2={x(head.current)} y2={height - 34} />
    <text class="now" x={Math.min(x(head.current), L + RW - 30)} y={TOP - 12} text-anchor="middle">{human(now)}</text>
  </svg>
  <div class="kit-states">
    <button class="kit-play" onclick={() => (playing ? pause() : play())} aria-pressed={playing}>{playing ? 'Pause' : head.current >= 0.999 ? 'Replay' : 'Play'}</button>
    <span class="kit-hint">Drag across the chart to move through time.</span>
  </div>
</figure>

<style>
  svg {
    touch-action: none;
    cursor: ew-resize;
  }

  .grid {
    stroke: var(--rule);
    stroke-dasharray: 2 4;
  }

  .axis {
    stroke: var(--rule-strong);
  }

  .mark {
    fill: var(--faint);
    font: 11px var(--sans);
  }

  .lane {
    fill: var(--muted);
    font: 500 12.5px var(--sans);
    transition: fill 0.3s;
  }

  .lane.active {
    fill: var(--fg);
  }

  .lane-note {
    fill: var(--faint);
    font: 10.5px var(--sans);
  }

  .bar-bg {
    fill: var(--b2);
  }

  .bar {
    fill: var(--acc);
  }

  .bar.alt {
    fill: var(--kit-b);
  }

  .peak {
    fill: var(--b0);
    stroke: var(--faint);
    stroke-width: 2;
  }

  .peak.on {
    stroke: var(--fg);
    fill: var(--fg);
  }

  .head {
    stroke: var(--fg);
    stroke-width: 1.5;
  }

  .now {
    fill: var(--fg);
    font: 600 11.5px var(--sans);
    font-variant-numeric: tabular-nums;
  }
</style>
