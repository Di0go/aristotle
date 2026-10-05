<script lang="ts">
  // One series over time as a step line with a light wash: the value holds until the next change.
  import { longDay, niceTicks, parseDay, shortDay } from './scale.ts';

  let { points, label, color = 'var(--right)' }: { points: { day: string; count: number }[]; label: string; color?: string } = $props();

  // Height and margins in px; the width follows the card. The right margin leaves room for the end label.
  const H = 220;
  const M = { top: 18, right: 44, bottom: 30, left: 36 };
  const plotH = H - M.top - M.bottom;
  const DAY_MS = 86_400_000;
  /** Roughly the tooltip's width, so it is kept inside the chart's right edge. */
  const TOOLTIP_W = 150;

  let width = $state(640);
  let active = $state<number | null>(null);

  const plotW = $derived(Math.max(120, width - M.left - M.right));
  const times = $derived(points.map((p) => parseDay(p.day).getTime()));
  const t0 = $derived(times[0] ?? 0);
  // A single point still gets a day's width of axis.
  const t1 = $derived(times.length > 1 ? times[times.length - 1] : t0 + DAY_MS);
  const y = $derived(niceTicks(Math.max(...points.map((p) => p.count), 1)));
  const last = $derived(points.length - 1);

  /** The step line: across to each day, then up or down to its value. */
  const line = $derived.by(() => {
    if (!points.length) return '';
    let d = `M${px(times[0])},${py(points[0].count)}`;
    for (let i = 1; i < points.length; i++) d += ` H${px(times[i])} V${py(points[i].count)}`;
    return d;
  });
  /** The wash under the line, closed along the bottom of the plot. */
  const area = $derived(points.length ? `${line} V${M.top + plotH} H${px(times[0])} Z` : '');
  /** Day labels: every point when there are two or fewer, else the first, middle and last. */
  const xTicks = $derived.by(() => {
    if (points.length <= 2) return points.map((_, i) => i);
    const mid = Math.round((points.length - 1) / 2);
    return [0, mid, points.length - 1];
  });

  function px(t: number): number {
    return M.left + ((t - t0) / (t1 - t0 || 1)) * plotW;
  }

  function py(v: number): number {
    return M.top + plotH - (v / y.max) * plotH;
  }

  /** The point closest to the pointer, by x. */
  function nearest(clientX: number, rect: DOMRect): number {
    const x = clientX - rect.left;
    let best = 0;
    for (let i = 1; i < times.length; i++) if (Math.abs(px(times[i]) - x) < Math.abs(px(times[best]) - x)) best = i;
    return best;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') active = Math.min(last, (active ?? -1) + 1);
    else if (e.key === 'ArrowLeft') active = Math.max(0, (active ?? last + 1) - 1);
    else return;
    e.preventDefault();
  }
</script>

<div class="chart" bind:clientWidth={width}>
  <!-- Focusable so the arrow keys can step through the points; the table view carries every value too. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <svg
    {width}
    height={H}
    role="img"
    aria-label="{label}: {points.at(-1)?.count ?? 0} now"
    tabindex="0"
    onpointermove={(e) => (active = nearest(e.clientX, (e.currentTarget as SVGSVGElement).getBoundingClientRect()))}
    onpointerleave={() => (active = null)}
    onfocus={() => (active = last)}
    onblur={() => (active = null)}
    onkeydown={onKey}
  >
    {#each y.ticks as t (t)}
      <line class="grid" x1={M.left} x2={M.left + plotW} y1={py(t)} y2={py(t)} />
      <text class="tick" x={M.left - 8} y={py(t)} text-anchor="end" dominant-baseline="central">{t}</text>
    {/each}
    {#each xTicks as i (i)}
      <text class="tick" x={px(times[i])} y={H - 8} text-anchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
        >{shortDay(points[i].day)}</text
      >
    {/each}
    <path d={area} fill={color} fill-opacity="0.1" />
    <path d={line} fill="none" stroke={color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    {#if active !== null}
      <line class="crosshair" x1={px(times[active])} x2={px(times[active])} y1={M.top} y2={M.top + plotH} />
      <circle cx={px(times[active])} cy={py(points[active].count)} r="4" fill={color} class="ring" />
    {/if}
    {#if points.length}
      <circle cx={px(times[last])} cy={py(points[last].count)} r="4" fill={color} class="ring" />
      <text class="end-label" x={px(times[last]) + 10} y={py(points[last].count)} dominant-baseline="central">{points[last].count}</text>
    {/if}
  </svg>
  {#if active !== null}
    <div class="tooltip" style:left="{Math.min(px(times[active]), width - TOOLTIP_W)}px" style:top="{M.top}px">
      <strong>{points[active].count}</strong>
      <span><i class="key" style:background={color}></i>{label}</span>
      <span class="muted">{longDay(points[active].day)}</span>
    </div>
  {/if}
</div>
