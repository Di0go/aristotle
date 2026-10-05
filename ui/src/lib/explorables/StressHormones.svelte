<script lang="ts">
  // An explorable stress response over two hours: heart rate, adrenaline and cortisol after a stressor you
  // set (how long, and whether a second one follows). The point it makes by feel: heart rate and adrenaline
  // come and go with the stressor; cortisol starts late, peaks after it is over, and is still up an hour on,
  // so a second stressor lands on top of the first.
  //
  // Each curve is the stressor convolved with a response shape fitted to the published time course
  // (illustrative, and labelled so):
  //   heart rate: follows within seconds;
  //   adrenaline: rises within seconds, clears with a plasma half-life of about two minutes;
  //   cortisol: starts rising a few minutes in, peaks about 15-25 min after the onset of a ~10-minute stressor
  //   (TSST studies), back near baseline about an hour after it ends.
  import { untrack } from 'svelte';
  import { Tween } from 'svelte/motion';
  import { linear } from 'svelte/easing';

  let { spec = {} }: { spec?: { minutes?: number; second?: boolean } } = $props();

  // Time, in minutes: the chart spans T, sampled every DT; a second stressor starts at SECOND_AT.
  const T = 120;
  const DT = 0.25;
  const SECOND_AT = 45;
  const MARKS = [0, 15, 30, 45, 60, 75, 90, 105, 120];
  /** The playhead takes this long to sweep the whole two hours. */
  const SWEEP_MS = 14000;

  // Layout, in viewBox units: L on the left for the axis, B at the bottom for the minute labels.
  const W = 540;
  const H = 230;
  const L = 34;
  const B = 26;
  /** The tallest value drawn, as a multiple of one stressor's peak: room for a longer or repeated one to show higher. */
  const Y_MAX = 1.45;

  type Stress = (t: number) => number;
  /** 1 while a stressor is on (2 where two overlap), 0 otherwise. */
  const stressOf =
    (len: number, twice: boolean): Stress =>
    (t) =>
      (t >= 0 && t < len ? 1 : 0) + (twice && t >= SECOND_AT && t < SECOND_AT + len ? 1 : 0);

  // Each response's shape (its kernel, minutes since the stress) and how far it reaches, in minutes.
  const K = {
    // follows within seconds and fades as fast
    hr: [(tau: number) => Math.exp(-tau / 0.4), 4],
    // rises within seconds, clears with a half-life of two minutes
    adr: [(tau: number) => (1 - Math.exp(-tau / 0.15)) * Math.exp((-tau * Math.LN2) / 2), 20],
    // nothing for three minutes, then a slow rise and a slower fall (a gamma-like shape)
    cort: [(tau: number) => (tau < 3 ? 0 : (tau - 3) ** 2 * Math.exp(-(tau - 3) / 7)), 110],
  } as const;

  // One scale per hormone, from a single 10-minute stressor, so longer or repeated stressors can go higher.
  const one = stressOf(10, false);
  const REF = {
    hr: Math.max(...convolve(K.hr[0], K.hr[1], one)),
    adr: Math.max(...convolve(K.adr[0], K.adr[1], one)),
    cort: Math.max(...convolve(K.cort[0], K.cort[1], one)),
  };

  const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Options set where the figure starts; after that the controls are his.
  const initial = untrack(() => ({ ...spec }));
  let minutes = $state(initial.minutes ?? 10);
  let second = $state(initial.second ?? false);
  let playing = $state(false);
  let svg = $state<SVGSVGElement>();
  // The playhead, in minutes. With reduced motion it rests at 22 min, about where cortisol peaks.
  const head = new Tween(still ? 22 : 0, { duration: 0, easing: linear });

  const series = $derived.by(() => {
    const st = stressOf(minutes, second);
    return {
      hr: convolve(K.hr[0], K.hr[1], st).map((v) => v / REF.hr),
      adr: convolve(K.adr[0], K.adr[1], st).map((v) => v / REF.adr),
      cort: convolve(K.cort[0], K.cort[1], st).map((v) => v / REF.cort),
    };
  });
  /** When cortisol peaks, in minutes, before any second stressor. */
  const cortPeak = $derived.by(() => {
    const c = series.cort.slice(0, Math.round((second ? SECOND_AT : T) / DT));
    const i = c.indexOf(Math.max(...c));
    return i * DT;
  });
  const ended = $derived(head.current >= T - 0.5);

  /** The response over T: the stress convolved with the kernel (a sum over the last `span` minutes, step DT). */
  function convolve(kernel: (tau: number) => number, span: number, stress: Stress): number[] {
    const n = Math.round(T / DT);
    const k = Array.from({ length: Math.round(span / DT) }, (_, i) => kernel(i * DT));
    const out = new Array(n + 1).fill(0);
    for (let i = 0; i <= n; i++) {
      let sum = 0;
      for (let j = 0; j < k.length && j <= i; j++) sum += k[j] * stress((i - j) * DT);
      out[i] = sum * DT;
    }
    return out;
  }

  function x(t: number): number {
    return L + (t / T) * (W - L - 8);
  }

  function y(v: number): number {
    return H - B - Math.min(Y_MAX, v) * ((H - B - 14) / Y_MAX);
  }

  function path(vals: number[]): string {
    return vals.map((v, i) => `${i ? 'L' : 'M'}${x(i * DT).toFixed(1)},${y(v).toFixed(1)}`).join('');
  }

  /** A series' value under the playhead. */
  function at(vals: number[]): number {
    return vals[Math.min(vals.length - 1, Math.round(head.current / DT))] ?? 0;
  }

  /** A level in words, against one stressor's peak (1). */
  function level(v: number): string {
    return v < 0.08
      ? 'at baseline'
      : v < 0.35
        ? 'slightly up'
        : v < 0.75
          ? 'up'
          : v < 1.1
            ? 'near its peak'
            : 'higher than one stressor alone';
  }

  /** Play from where the playhead is (or from the start once it has ended), at the full sweep's speed. */
  function play() {
    if (ended) head.set(0, { duration: 0 });
    playing = true;
    void head.set(T, { duration: SWEEP_MS * (1 - head.current / T) }).then(() => (playing = false));
  }

  function pause() {
    playing = false;
    head.set(head.current, { duration: 0 });
  }

  /** Move the playhead to the pointer, on press or while dragging. */
  function scrub(e: PointerEvent) {
    if (!svg || (e.type === 'pointermove' && e.buttons !== 1)) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    playing = false;
    head.set(Math.min(T, Math.max(0, ((px - L) / (W - L - 8)) * T)), { duration: 0 });
  }
</script>

<figure class="kit explorable hormones">
  <p class="kit-title">Two hours after a stressor</p>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <svg
    bind:this={svg}
    viewBox="0 0 {W} {H}"
    role="img"
    aria-label="Heart rate, adrenaline and cortisol over two hours"
    onpointerdown={scrub}
    onpointermove={scrub}
  >
    <rect class="band" x={x(0)} y="8" width={x(minutes) - x(0)} height={H - B - 8} />
    {#if second}<rect class="band" x={x(SECOND_AT)} y="8" width={x(SECOND_AT + minutes) - x(SECOND_AT)} height={H - B - 8} />{/if}
    {#each MARKS as m (m)}
      <line class="grid" x1={x(m)} y1="8" x2={x(m)} y2={H - B} />
      <text class="tick" x={x(m)} y={H - 8} text-anchor={m === T ? 'end' : 'middle'}>{m === T ? `${T} min` : m}</text>
    {/each}
    <line class="axis" x1={L} y1={H - B} x2={W - 8} y2={H - B} />
    <path class="c hr" d={path(series.hr)} />
    <path class="c adr" d={path(series.adr)} />
    <path class="c cort" d={path(series.cort)} />
    <line class="head" x1={x(head.current)} y1="4" x2={x(head.current)} y2={H - B} />
    <text class="lab" x={x(minutes) + 4} y="20">stressor</text>
  </svg>

  <div class="legend-row">
    <span><i class="k hr"></i>Heart rate <b>{level(at(series.hr))}</b></span>
    <span><i class="k adr"></i>Adrenaline <b>{level(at(series.adr))}</b></span>
    <span><i class="k cort"></i>Cortisol <b>{level(at(series.cort))}</b></span>
    <span class="t">{Math.round(head.current)} min</span>
  </div>

  <div class="kit-states">
    <button class="kit-play" onclick={() => (playing ? pause() : play())} aria-pressed={playing}
      >{playing ? 'Pause' : ended ? 'Replay' : 'Play'}</button
    >
    <label class="opt">Stressor <input type="range" min="2" max="25" step="1" bind:value={minutes} /> <span>{minutes} min</span></label>
    <label class="opt"><input type="checkbox" bind:checked={second} /> A second one at 45 min</label>
  </div>
  <p class="kit-note">
    Cortisol peaks about {Math.round(cortPeak)} minutes in, after the stressor is over, and is still up an hour later. {second
      ? 'The second stressor starts while cortisol from the first is still well above baseline, so it stays up for well over an hour in all: likely part of why you can feel tired but wired after a hard session.'
      : 'Tick “a second one” to see what a second round does.'}
  </p>
  <p class="model">
    Illustrative curves, each scaled to its response to one 10-minute stressor. Shapes follow published time courses: adrenaline’s plasma
    half-life of about 2 minutes; cortisol peaking about 15 to 25 minutes after the start of a stressor (Trier Social Stress Test studies).
  </p>
</figure>

<style>
  svg {
    touch-action: none;
    cursor: ew-resize;
  }

  .band {
    fill: var(--acc-soft);
  }

  .grid {
    stroke: var(--rule);
    stroke-dasharray: 2 4;
  }

  .axis {
    stroke: var(--rule-strong);
  }

  .tick,
  .lab {
    fill: var(--faint);
    font: 10.5px var(--sans);
  }

  .c {
    fill: none;
    stroke-width: 2.2;
    stroke-linejoin: round;
  }

  .c.hr {
    stroke: var(--muted);
    stroke-dasharray: 5 4;
  }

  .c.adr {
    stroke: var(--acc);
  }

  .c.cort {
    stroke: var(--kit-b);
  }

  .head {
    stroke: var(--fg);
    stroke-width: 1.4;
  }

  .legend-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    margin-top: 10px;
    font-size: 0.84rem;
    text-align: left;
    color: var(--muted);
  }

  .legend-row b {
    font-weight: 600;
    color: var(--fg);
  }

  .legend-row .t {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    color: var(--fg);
  }

  .k {
    display: inline-block;
    width: 16px;
    height: 0;
    margin-right: 6px;
    vertical-align: middle;
    border-top: 2.5px solid;
  }

  .k.hr {
    border-color: var(--muted);
    border-top-style: dashed;
  }

  .k.adr {
    border-color: var(--acc);
  }

  .k.cort {
    border-color: var(--kit-b);
  }

  .opt {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.82rem;
    color: var(--muted);
  }

  .opt input[type='range'] {
    width: 120px;
    accent-color: var(--acc);
  }

  .opt input[type='checkbox'] {
    accent-color: var(--acc);
  }

  .model {
    margin: 8px 0 0;
    font-size: 0.74rem;
    color: var(--faint);
    text-align: left;
  }
</style>
