<script lang="ts">
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
  import { onMount, untrack } from 'svelte';

  let { spec = {} }: { spec?: { age?: number; start?: string } } = $props();

  const PRESETS = [
    { id: 'asleep', label: 'Asleep', brake: 0.85, accel: 0.0 },
    { id: 'resting', label: 'Resting', brake: 0.72, accel: 0.04 },
    { id: 'called', label: 'Name called', brake: 0.25, accel: 0.06 },
    { id: 'round', label: 'All-out effort', brake: 0.0, accel: 0.85 },
    { id: 'transplant', label: 'No nerves at all', brake: 0, accel: 0 },
  ];

  // Options set where the figure starts; after that the sliders are his.
  const initial = untrack(() => ({ ...spec }));
  let age = $state(initial.age ?? 24);
  let brake = $state(0.72);
  let accel = $state(0.04);
  let denervated = $state(false);
  let preset = $state<string | null>('resting');

  const ihr = $derived(118.1 - 0.57 * age);
  const hrMax = $derived(208 - 0.7 * age);

  // Effects that lag their sliders.
  let vEff = 0.72;
  let sEff = 0.04;
  let sQueue: { t: number; v: number }[] = [];
  let rate = $state(0);
  let history: { t: number; hr: number }[] = [];

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

  const start = PRESETS.find((p) => p.id === initial.start);
  if (start) {
    brake = start.brake;
    accel = start.accel;
    preset = start.id;
    vEff = start.brake;
    sEff = start.accel;
  }

  let canvas = $state<HTMLCanvasElement>();
  let beat = $state(0);
  let pulse = $state(0);

  onMount(() => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();
    let phase = 0;
    let since = 10;
    const trace: number[] = [];
    const TRACE_SECONDS = 6;
    const css = getComputedStyle(document.documentElement);

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      const vTarget = denervated ? 0 : brake;
      const sTarget = denervated ? 0 : accel;
      // the accelerator's command arrives late
      sQueue.push({ t, v: sTarget });
      while (sQueue.length > 1 && sQueue[1].t <= t - 1.5) sQueue.shift();
      const sCmd = sQueue[0].t <= t - 1.5 ? sQueue[0].v : sEff;
      vEff += (vTarget - vEff) * (1 - Math.exp(-dt / 0.6));
      sEff += (sCmd - sEff) * (1 - Math.exp(-dt / 7));
      rate = target(vEff, sEff);
      history.push({ t, hr: rate });
      while (history.length && history[0].t < t - 30) history.shift();

      // beats
      phase += (rate / 60) * dt;
      since += dt;
      if (phase >= 1) {
        phase -= 1;
        since = 0;
        beat++;
      }
      pulse = Math.max(0, 1 - since / 0.25);

      // trace: a stylised beat shape (P, QRS, T) as a function of time since the beat
      const v = (() => {
        const s = since;
        if (s < 0.04) return -0.12 * Math.sin((s / 0.04) * Math.PI);
        if (s < 0.08) return Math.sin(((s - 0.04) / 0.04) * Math.PI);
        if (s < 0.12) return -0.25 * Math.sin(((s - 0.08) / 0.04) * Math.PI);
        if (s > 0.2 && s < 0.38) return 0.22 * Math.sin(((s - 0.2) / 0.18) * Math.PI);
        return 0;
      })();
      trace.push(v);
      const keep = Math.round(TRACE_SECONDS * 60);
      while (trace.length > keep) trace.shift();

      if (canvas) {
        const ctx = canvas.getContext('2d')!;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const dpr = devicePixelRatio || 1;
        if (canvas.width !== w * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        // trace (top two thirds)
        const th = h * 0.5;
        ctx.strokeStyle = css.getPropertyValue('--rule').trim();
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, th * 0.62);
        ctx.lineTo(w, th * 0.62);
        ctx.stroke();
        const heart = css.getPropertyValue('--heart').trim();
        ctx.strokeStyle = heart;
        ctx.lineWidth = 2;
        ctx.beginPath();
        trace.forEach((y, i) => {
          const x = (i / keep) * w;
          const yy = th * 0.62 - y * th * 0.5;
          if (i === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        });
        ctx.stroke();
        // rate over the last 30 s (bottom)
        const top = h * 0.6;
        const bh = h - top - 14;
        const lo = 30;
        const hi = 210;
        const faint = css.getPropertyValue('--faint').trim();
        ctx.fillStyle = faint;
        ctx.font = `11px ${css.getPropertyValue('--sans')}`;
        ctx.fillText('heart rate, last 30 s', 0, top - 2);
        const yOf = (hr: number) => top + 6 + bh - ((hr - lo) / (hi - lo)) * bh;
        // Reference lines, labelled in beats a minute, so the curve can be read.
        ctx.strokeStyle = css.getPropertyValue('--rule').trim();
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
        const xOf = (p: { t: number }) => ((p.t - (t - 30)) / 30) * (w - 32);
        if (history.length > 1) {
          // The area under the curve, then the curve.
          ctx.beginPath();
          history.forEach((p, i) => (i === 0 ? ctx.moveTo(xOf(p), yOf(p.hr)) : ctx.lineTo(xOf(p), yOf(p.hr))));
          ctx.lineTo(xOf(history[history.length - 1]), top + 6 + bh);
          ctx.lineTo(xOf(history[0]), top + 6 + bh);
          ctx.closePath();
          ctx.globalAlpha = 0.14;
          ctx.fillStyle = heart;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = heart;
        ctx.lineWidth = 2;
        ctx.beginPath();
        history.forEach((p, i) => (i === 0 ? ctx.moveTo(xOf(p), yOf(p.hr)) : ctx.lineTo(xOf(p), yOf(p.hr))));
        ctx.stroke();
      }
      if (!still) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    if (still) {
      // One frame is enough to show the state; sliders re-render on input.
      const t = setInterval(() => frame(performance.now()), 200);
      return () => clearInterval(t);
    }
    return () => cancelAnimationFrame(raf);
  });
</script>

<figure class="kit explorable heart">
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
    Try it: from Resting, drop the brake and the rate jumps within a beat or two. Push the accelerator instead and it climbs over several seconds. That difference is why your heart jumps the moment your name is called, long before adrenaline arrives.
  </p>
  <p class="model">A simplified model. Intrinsic rate 118.1 − 0.57 × age (Jose and Collison); maximum 208 − 0.7 × age (Tanaka, 2001); both are averages that vary by person.</p>
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
