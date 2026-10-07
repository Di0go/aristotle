<script lang="ts" module>
  // An explorable heart: drag the brake (vagal tone) and the accelerator (sympathetic drive) and watch the
  // heart, its trace and its rate respond. The point it makes by feel: the brake acts within a beat or two,
  // the accelerator takes seconds to tens of seconds.
  //
  // Model (simplified, and said so on the figure):
  //   resting rate with no nerves (intrinsic)  IHR   = 118.1 - 0.57 * age        (Jose & Collison)
  //   maximum rate                              HRmax = 208 - 0.7 * age          (Tanaka 2001)
  //   the brake can pull the rate down to about half of IHR; the accelerator pushes toward HRmax.
  //   vagal effect follows its slider with a time constant of ~0.6 s; sympathetic effect starts after ~1.5 s
  //   and follows with ~7 s (latency 1-5 s, peak 4-20 s, steady by ~30 s in the classic work).

  /**
   * Samples (time, value), oldest first, in a growable circular buffer: adding one and dropping the oldest costs the
   * same however many there are (an array's shift() moves every element, every frame).
   */
  class Ring {
    private ts = new Float64Array(512);
    private vs = new Float64Array(512);
    private head = 0;
    length = 0;

    push(t: number, v: number) {
      if (this.length === this.ts.length) this.grow();
      const i = (this.head + this.length) % this.ts.length;
      this.ts[i] = t;
      this.vs[i] = v;
      this.length++;
    }

    shift() {
      if (this.length === 0) return;
      this.head = (this.head + 1) % this.ts.length;
      this.length--;
    }

    /** Drops the samples older than `t`. */
    dropBefore(t: number) {
      while (this.length && this.t(0) < t) this.shift();
    }

    /** The time of the i-th oldest sample. */
    t(i: number): number {
      return this.ts[(this.head + i) % this.ts.length];
    }

    /** The value of the i-th oldest sample. */
    v(i: number): number {
      return this.vs[(this.head + i) % this.vs.length];
    }

    private grow() {
      const n = this.ts.length;
      const ts = new Float64Array(n * 2);
      const vs = new Float64Array(n * 2);
      for (let i = 0; i < this.length; i++) {
        ts[i] = this.t(i);
        vs[i] = this.v(i);
      }
      this.ts = ts;
      this.vs = vs;
      this.head = 0;
    }
  }
</script>

<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { whileVisible } from '../visible.ts';

  let { spec = {} }: { spec?: { age?: number; start?: string } } = $props();

  const PRESETS = [
    { id: 'asleep', label: 'Asleep', brake: 0.85, accel: 0.0 },
    { id: 'resting', label: 'Resting', brake: 0.72, accel: 0.04 },
    { id: 'called', label: 'Name called', brake: 0.25, accel: 0.06 },
    { id: 'round', label: 'All-out effort', brake: 0.0, accel: 0.85 },
    { id: 'transplant', label: 'No nerves at all', brake: 0, accel: 0 },
  ];

  // The model's timings, in seconds (see the header).
  const VAGAL_TAU = 0.6;
  const SYMP_DELAY = 1.5;
  const SYMP_TAU = 7;
  /** The rate chart shows this many seconds back. */
  const HISTORY_S = 30;
  /** The trace shows this many seconds back. */
  const TRACE_S = 6;
  /** How long the heart stays swollen after a beat, in seconds. */
  const PULSE_S = 0.25;
  // The rate chart's range, in beats a minute.
  const RATE_LO = 30;
  const RATE_HI = 210;

  // Options set where the figure starts; after that the sliders are his.
  const initial = untrack(() => ({ ...spec }));
  let age = $state(initial.age ?? 24);
  let brake = $state(0.72);
  let accel = $state(0.04);
  let denervated = $state(false);
  let preset = $state<string | null>('resting');
  let rate = $state(0);
  let pulse = $state(0);
  let canvas = $state<HTMLCanvasElement>();
  let figure = $state<HTMLElement>();

  // Effects that lag their sliders, and what has happened lately. Plain variables: only the frame loop reads them.
  let vEff = 0.72;
  let sEff = 0.04;
  const sQueue = new Ring();
  const history = new Ring();

  const ihr = $derived(118.1 - 0.57 * age);
  const hrMax = $derived(208 - 0.7 * age);

  const start = PRESETS.find((p) => p.id === initial.start);
  if (start) {
    brake = start.brake;
    accel = start.accel;
    preset = start.id;
    vEff = start.brake;
    sEff = start.accel;
  }

  /** The rate the nerves are asking for: the brake pulls down to half of IHR, the accelerator from there toward HRmax. */
  function target(v: number, s: number) {
    const base = ihr * (1 - 0.5 * v);
    return base + s * (hrMax - base);
  }

  function choose(id: string) {
    const p = PRESETS.find((x) => x.id === id)!;
    preset = id;
    denervated = id === 'transplant';
    brake = p.brake;
    accel = p.accel;
  }

  /** A stylised beat on the trace (P, QRS, T) as a function of seconds since the beat; flat in between. */
  function ecg(s: number): number {
    if (s < 0.04) return -0.12 * Math.sin((s / 0.04) * Math.PI);
    if (s < 0.08) return Math.sin(((s - 0.04) / 0.04) * Math.PI);
    if (s < 0.12) return -0.25 * Math.sin(((s - 0.08) / 0.04) * Math.PI);
    if (s > 0.2 && s < 0.38) return 0.22 * Math.sin(((s - 0.2) / 0.18) * Math.PI);
    return 0;
  }

  onMount(() => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    let last = performance.now();
    let phase = 0;
    let since = 10;
    // One trace sample per frame, kept by time so the trace spans TRACE_S at any frame rate.
    const trace = new Ring();
    // The canvas's size and the theme's colours, read when they change rather than on every frame.
    let w = 0;
    let h = 0;
    let ink = { rule: '', heart: '', faint: '', font: '' };
    const readInk = () => {
      const css = getComputedStyle(document.documentElement);
      ink = {
        rule: css.getPropertyValue('--rule').trim(),
        heart: css.getPropertyValue('--heart').trim(),
        faint: css.getPropertyValue('--faint').trim(),
        font: `11px ${css.getPropertyValue('--sans')}`,
      };
    };
    readInk();
    const looks = new MutationObserver(readInk);
    looks.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] });
    const sizes = new ResizeObserver(() => {
      if (!canvas) return;
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      // Drawn at the screen's pixel density, so lines stay sharp.
      const dpr = devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    });
    if (canvas) sizes.observe(canvas);

    function frame(now: number) {
      // Capped, so a frame after the figure was out of sight doesn't jump the model; the cap lets through the 200 ms
      // frames of reduced motion, so the model still runs in real time.
      const dt = Math.min(still ? 0.25 : 0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const vTarget = denervated ? 0 : brake;
      const sTarget = denervated ? 0 : accel;
      // The accelerator's command arrives late: queue it and act on what was asked SYMP_DELAY ago.
      sQueue.push(t, sTarget);
      while (sQueue.length > 1 && sQueue.t(1) <= t - SYMP_DELAY) sQueue.shift();
      const sCmd = sQueue.t(0) <= t - SYMP_DELAY ? sQueue.v(0) : sEff;
      // Each effect closes the gap to its command exponentially, with its own time constant.
      vEff += (vTarget - vEff) * (1 - Math.exp(-dt / VAGAL_TAU));
      sEff += (sCmd - sEff) * (1 - Math.exp(-dt / SYMP_TAU));
      rate = target(vEff, sEff);
      history.push(t, rate);
      history.dropBefore(t - HISTORY_S);

      // Beats: the phase runs at the rate, and each time it wraps the heart beats.
      phase += (rate / 60) * dt;
      since += dt;
      if (phase >= 1) {
        phase -= 1;
        since = 0;
      }
      pulse = Math.max(0, 1 - since / PULSE_S);

      trace.push(t, ecg(since));
      trace.dropBefore(t - TRACE_S);

      if (canvas && w > 0) {
        const ctx = canvas.getContext('2d')!;
        const dpr = devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        // The trace, in the top half, around a baseline 62% of the way down it.
        const th = h * 0.5;
        const baseline = th * 0.62;
        ctx.strokeStyle = ink.rule;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, baseline);
        ctx.lineTo(w, baseline);
        ctx.stroke();
        ctx.strokeStyle = ink.heart;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < trace.length; i++) {
          const x = ((trace.t(i) - (t - TRACE_S)) / TRACE_S) * w;
          const yy = baseline - trace.v(i) * th * 0.5;
          if (i === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();

        // The rate over the last HISTORY_S seconds, along the bottom, with room on the right for the labels.
        const top = h * 0.6;
        const bh = h - top - 14;
        ctx.fillStyle = ink.faint;
        ctx.font = ink.font;
        ctx.fillText('heart rate, last 30 s', 0, top - 2);
        const yOf = (hr: number) => top + 6 + bh - ((hr - RATE_LO) / (RATE_HI - RATE_LO)) * bh;
        const xOf = (ts: number) => ((ts - (t - HISTORY_S)) / HISTORY_S) * (w - 32);
        // Reference lines, labelled in beats a minute, so the curve can be read.
        ctx.strokeStyle = ink.rule;
        ctx.lineWidth = 1;
        ctx.textAlign = 'right';
        for (const ref of [60, 120, 180]) {
          ctx.beginPath();
          ctx.moveTo(0, yOf(ref));
          ctx.lineTo(w - 28, yOf(ref));
          ctx.stroke();
          ctx.fillText(String(ref), w, yOf(ref) + 4);
        }
        ctx.textAlign = 'left';
        const curve = () => {
          ctx.beginPath();
          for (let i = 0; i < history.length; i++) {
            if (i === 0) ctx.moveTo(xOf(history.t(i)), yOf(history.v(i)));
            else ctx.lineTo(xOf(history.t(i)), yOf(history.v(i)));
          }
        };
        if (history.length > 1) {
          // The area under the curve, then the curve.
          curve();
          ctx.lineTo(xOf(history.t(history.length - 1)), top + 6 + bh);
          ctx.lineTo(xOf(history.t(0)), top + 6 + bh);
          ctx.closePath();
          ctx.globalAlpha = 0.14;
          ctx.fillStyle = ink.heart;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = ink.heart;
        ctx.lineWidth = 2;
        curve();
        ctx.stroke();
      }
      if (!still && raf) raf = requestAnimationFrame(frame);
    }

    // The heart beats only while it can be seen; out of sight (scrolled away, the tab hidden) it rests.
    const run = (visible: boolean) => {
      cancelAnimationFrame(raf);
      raf = 0;
      clearInterval(interval);
      interval = undefined;
      if (!visible) return;
      last = performance.now();
      // With reduced motion there is no animation loop: a frame every 200 ms is enough to follow the sliders.
      if (still) interval = setInterval(() => frame(performance.now()), 200);
      else raf = requestAnimationFrame(frame);
    };
    const stop = figure ? whileVisible(figure, run) : () => {};
    return () => {
      stop();
      run(false);
      looks.disconnect();
      sizes.disconnect();
    };
  });
</script>

<figure class="kit explorable heart" bind:this={figure}>
  <p class="kit-title">Brake, accelerator and your heart</p>
  <div class="hr-top">
    <svg class="heart-svg" viewBox="0 0 100 92" aria-hidden="true" style:transform="scale({1 + pulse * 0.09})">
      <path d="M50 88 C18 64 4 46 4 28 C4 14 15 4 28 4 C38 4 46 10 50 18 C54 10 62 4 72 4 C85 4 96 14 96 28 C96 46 82 64 50 88 Z" />
    </svg>
    <div class="hr-read">
      <span class="hr-num">{Math.round(rate)}</span><span class="hr-unit">beats a minute</span>
      <span class="hr-sub">Pacemaker alone at {age}: about {Math.round(ihr)}. Most it can reach: about {Math.round(hrMax)}.</span>
    </div>
  </div>
  <canvas bind:this={canvas} class="hr-canvas" aria-label="Heart trace and heart rate over the last 30 seconds"></canvas>

  <div class="kit-states" role="group" aria-label="Situations">
    {#each PRESETS as p (p.id)}
      <button class:on={preset === p.id} onclick={() => choose(p.id)}>{p.label}</button>
    {/each}
  </div>
  <div class="hr-controls">
    <label class:off={denervated}>
      <span>Brake <em>vagus nerve</em></span>
      <input type="range" min="0" max="1" step="0.01" bind:value={brake} disabled={denervated} oninput={() => (preset = null)} />
    </label>
    <label class:off={denervated}>
      <span>Accelerator <em>sympathetic nerves</em></span>
      <input type="range" min="0" max="1" step="0.01" bind:value={accel} disabled={denervated} oninput={() => (preset = null)} />
    </label>
    <label>
      <span>Age <em>{age}</em></span>
      <input type="range" min="15" max="70" step="1" bind:value={age} />
    </label>
  </div>
  <p class="kit-note">
    Try it: from Resting, drop the brake and the rate jumps within a beat or two. Push the accelerator instead and it climbs over several
    seconds. That difference is why your heart jumps the moment your name is called, long before adrenaline arrives.
  </p>
  <p class="model">
    A simplified model. Intrinsic rate 118.1 − 0.57 × age (Jose and Collison); maximum 208 − 0.7 × age (Tanaka, 2001); both are averages
    that vary by person.
  </p>
</figure>

<style>
  .hr-top {
    display: flex;
    align-items: center;
    gap: 22px;
    margin-bottom: 8px;
    text-align: left;
  }

  .heart-svg {
    flex: none;
    width: 74px;
    height: 68px;
    transform-origin: 50% 60%;
  }

  .heart-svg path {
    fill: var(--heart);
    opacity: 0.9;
  }

  .hr-read {
    display: grid;
  }

  .hr-num {
    font-size: 2.5rem;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
  }

  .hr-unit {
    font-size: 0.85rem;
    color: var(--muted);
  }

  .hr-sub {
    margin-top: 4px;
    font-size: 0.8rem;
    color: var(--faint);
  }

  .hr-canvas {
    display: block;
    width: 100%;
    height: 260px;
  }

  .hr-controls {
    display: grid;
    gap: 10px;
    margin-top: 14px;
    text-align: left;
  }

  .hr-controls label {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    font-size: 0.88rem;
  }

  .hr-controls label.off {
    opacity: 0.45;
  }

  .hr-controls em {
    font-style: normal;
    color: var(--faint);
    margin-left: 4px;
  }

  .hr-controls input {
    accent-color: var(--acc);
  }

  .model {
    margin: 8px 0 0;
    font-size: 0.74rem;
    color: var(--faint);
    text-align: left;
  }

  @media (max-width: 600px) {
    .hr-controls label {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }
  }
</style>
