<script lang="ts">
  // Two forces pulling one value: a dial with a needle, a bar for each force, and states to step through
  // (or two sliders to try it yourself). Written as a ```balance block of JSON.
  import { Tween } from 'svelte/motion';
  import { cubicInOut } from 'svelte/easing';

  interface Force {
    label: string;
    detail?: string;
  }
  interface State {
    label: string;
    left: number;
    right: number;
    value?: number;
    note?: string;
  }
  interface Spec {
    title?: string;
    left: Force;
    right: Force;
    unit?: string;
    min: number;
    max: number;
    /** The value with neither force acting (e.g. the pacemaker's own rate). */
    neutral: number;
    neutralLabel?: string;
    states?: State[];
  }

  let { spec }: { spec: Spec } = $props();

  const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = { duration: still ? 0 : 900, easing: cubicInOut };

  let at = $state(0);
  let playing = $state(false);
  let exploring = $state(false);
  const states = $derived(spec.states ?? []);
  const leftF = new Tween(0.5, ease);
  const rightF = new Tween(0.5, ease);
  const value = new Tween(0, ease);

  /** With no stated value, the forces decide: each pulls from neutral toward its end of the scale. */
  function valueOf(l: number, r: number): number {
    return spec.neutral - l * (spec.neutral - spec.min) + r * (spec.max - spec.neutral);
  }

  function go(i: number) {
    if (!states.length) return;
    at = (i + states.length) % states.length;
    const s = states[at];
    leftF.target = s.left;
    rightF.target = s.right;
    value.target = s.value ?? valueOf(s.left, s.right);
  }

  $effect(() => {
    if (states.length) {
      leftF.set(states[0].left, { duration: 0 });
      rightF.set(states[0].right, { duration: 0 });
      value.set(states[0].value ?? valueOf(states[0].left, states[0].right), { duration: 0 });
    } else value.set(valueOf(0.5, 0.5), { duration: 0 });
  });

  $effect(() => {
    if (!playing) return;
    const t = setInterval(() => go(at + 1), 2600);
    return () => clearInterval(t);
  });

  function slide(which: 'l' | 'r', v: number) {
    playing = false;
    exploring = true;
    const l = which === 'l' ? v : leftF.target;
    const r = which === 'r' ? v : rightF.target;
    leftF.set(l, { duration: 0 });
    rightF.set(r, { duration: 0 });
    value.target = valueOf(l, r);
  }

  // The dial: a 220° arc.
  const CX = 280;
  const CY = 150;
  const R = 112;
  const A0 = -200;
  const A1 = 20;
  const angle = (v: number) => A0 + ((Math.min(spec.max, Math.max(spec.min, v)) - spec.min) / (spec.max - spec.min)) * (A1 - A0);
  const pt = (deg: number, r = R) => ({ x: CX + r * Math.cos((deg * Math.PI) / 180), y: CY + r * Math.sin((deg * Math.PI) / 180) });
  function arc(a: number, b: number, r = R) {
    const p = pt(a, r);
    const q = pt(b, r);
    return `M${p.x},${p.y} A${r},${r} 0 ${Math.abs(b - a) > 180 ? 1 : 0} 1 ${q.x},${q.y}`;
  }
  const ticks = $derived(Array.from({ length: 9 }, (_, i) => spec.min + ((spec.max - spec.min) * i) / 8));
  const needle = $derived(pt(angle(value.current), R - 16));
  const fmt = (v: number) => (Math.abs(spec.max - spec.min) >= 20 ? Math.round(v) : Math.round(v * 10) / 10);
</script>

<figure class="kit kit-balance">
  {#if spec.title}<p class="kit-title">{spec.title}</p>{/if}
  <svg viewBox="0 0 560 300" role="img" aria-label="{spec.left.label} against {spec.right.label}: {fmt(value.current)} {spec.unit ?? ''}">
    <!-- scale -->
    <path class="track" d={arc(A0, A1)} />
    <path class="span-l" d={arc(angle(spec.neutral) - (angle(spec.neutral) - A0) * leftF.current, angle(spec.neutral))} />
    <path class="span-r" d={arc(angle(spec.neutral), angle(spec.neutral) + (A1 - angle(spec.neutral)) * rightF.current)} />
    {#each ticks as t, i (i)}
      {@const a = angle(t)}
      {@const p = pt(a, R + 8)}
      {@const q = pt(a, R + 15)}
      <line class="tick" x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
      {#if i % 2 === 0}
        {@const l = pt(a, R + 30)}
        <text class="tick-l" x={l.x} y={l.y + 4} text-anchor="middle">{fmt(t)}</text>
      {/if}
    {/each}
    <!-- neutral mark -->
    {#if true}
      {@const n = pt(angle(spec.neutral), R - 10)}
      {@const n2 = pt(angle(spec.neutral), R + 10)}
      <line class="neutral" x1={n.x} y1={n.y} x2={n2.x} y2={n2.y} />
    {/if}
    <!-- needle -->
    <line class="needle" x1={CX} y1={CY} x2={needle.x} y2={needle.y} />
    <circle class="hub" cx={CX} cy={CY} r="6" />
    <text class="readout" x={CX} y={CY + 52} text-anchor="middle">{fmt(value.current)}<tspan class="unit" dx="6">{spec.unit ?? ''}</tspan></text>
    <text class="neutral-l" x={CX} y={CY + 74} text-anchor="middle">{spec.neutralLabel ?? `${fmt(spec.neutral)} with neither`}</text>

    <!-- the two forces -->
    <g transform="translate(0 252)">
      <rect class="bar-bg" x="40" y="0" width="200" height="8" rx="4" />
      <rect class="bar-l" x={240 - 200 * leftF.current} y="0" width={200 * leftF.current} height="8" rx="4" />
      <text class="force" x="40" y="30">{spec.left.label}</text>
      {#if spec.left.detail}<text class="force-d" x="40" y="46">{spec.left.detail}</text>{/if}
      <rect class="bar-bg" x="320" y="0" width="200" height="8" rx="4" />
      <rect class="bar-r" x="320" y="0" width={200 * rightF.current} height="8" rx="4" />
      <text class="force" x="520" y="30" text-anchor="end">{spec.right.label}</text>
      {#if spec.right.detail}<text class="force-d" x="520" y="46" text-anchor="end">{spec.right.detail}</text>{/if}
    </g>
  </svg>

  {#if states.length}
    <div class="kit-states" role="group" aria-label="States">
      {#each states as s, i (i)}
        <button class:on={i === at && !exploring} onclick={() => { playing = false; exploring = false; go(i); }}>{s.label}</button>
      {/each}
      <button class="kit-play" onclick={() => { exploring = false; playing = !playing; if (playing) go(at + 1); }} aria-pressed={playing}>{playing ? 'Pause' : 'Play'}</button>
    </div>
    {#if states[at]?.note && !exploring}<p class="kit-note">{states[at].note}</p>{/if}
  {/if}
  <details class="kit-try" bind:open={exploring}>
    <summary>Try it yourself</summary>
    <label>{spec.left.label}<input type="range" min="0" max="1" step="0.01" value={leftF.target} oninput={(e) => slide('l', Number(e.currentTarget.value))} /></label>
    <label>{spec.right.label}<input type="range" min="0" max="1" step="0.01" value={rightF.target} oninput={(e) => slide('r', Number(e.currentTarget.value))} /></label>
  </details>
</figure>

<style>
  .track {
    fill: none;
    stroke: var(--b2);
    stroke-width: 14;
    stroke-linecap: round;
  }

  .span-l,
  .span-r {
    fill: none;
    stroke-width: 14;
  }

  .span-l {
    stroke: var(--acc);
    opacity: 0.85;
  }

  .span-r {
    stroke: var(--kit-b);
    opacity: 0.85;
  }

  .tick {
    stroke: var(--rule-strong);
    stroke-width: 1.5;
  }

  .tick-l,
  .neutral-l,
  .force-d {
    fill: var(--faint);
    font: 11.5px var(--sans);
  }

  .neutral {
    stroke: var(--fg);
    stroke-width: 2;
  }

  .needle {
    stroke: var(--fg);
    stroke-width: 3;
    stroke-linecap: round;
  }

  .hub {
    fill: var(--fg);
  }

  .readout {
    fill: var(--fg);
    font: 650 34px var(--sans);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }

  .unit {
    fill: var(--muted);
    font-size: 14px;
    font-weight: 500;
  }

  .bar-bg {
    fill: var(--b2);
  }

  .bar-l {
    fill: var(--acc);
  }

  .bar-r {
    fill: var(--kit-b);
  }

  .force {
    fill: var(--fg);
    font: 600 13px var(--sans);
  }

  .kit-try label {
    display: grid;
    grid-template-columns: 120px 1fr;
    align-items: center;
    gap: 10px;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .kit-try input {
    accent-color: var(--acc);
  }
</style>
