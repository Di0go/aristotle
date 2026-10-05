<script lang="ts">
  // Columns stacked by series, one per row (e.g. per week), with a 2px surface gap between segments.
  import { niceTicks } from './scale.ts';

  interface Series {
    key: string;
    label: string;
    color: string;
  }

  let {
    rows,
    series,
    label,
    unit = '',
  }: {
    rows: { key: string; label: string; values: Record<string, number> }[];
    series: Series[];
    label: string;
    unit?: string;
  } = $props();

  // Height and margins in px; the width follows the card.
  const H = 220;
  const M = { top: 12, right: 8, bottom: 30, left: 36 };
  const plotH = H - M.top - M.bottom;
  /** The surface gap between stacked segments. */
  const GAP = 2;
  /** A column fills 60% of its band, up to this width. */
  const MAX_COL_W = 24;
  /** The least room an x label needs; labels are thinned out to fit. */
  const LABEL_SPACE = 64;
  /** Roughly the tooltip's width, so it is kept inside the plot's right edge. */
  const TOOLTIP_W = 170;

  let width = $state(640);
  let active = $state<number | null>(null);

  const plotW = $derived(Math.max(120, width - M.left - M.right));
  const totals = $derived(rows.map((r) => series.reduce((n, s) => n + (r.values[s.key] ?? 0), 0)));
  const y = $derived(niceTicks(Math.max(...totals, 1)));
  const band = $derived(plotW / Math.max(rows.length, 1));
  const colW = $derived(Math.min(MAX_COL_W, band * 0.6));
  /** Label every nth column. */
  const every = $derived(Math.max(1, Math.ceil(rows.length / Math.floor(plotW / LABEL_SPACE))));

  function py(v: number): number {
    return M.top + plotH - (v / y.max) * plotH;
  }

  /** Segment rectangles bottom-up; only the topmost gets the rounded data-end. */
  function segments(i: number) {
    const out: { key: string; color: string; y: number; h: number; top: boolean }[] = [];
    let acc = 0;
    const visible = series.filter((s) => (rows[i].values[s.key] ?? 0) > 0);
    visible.forEach((s, j) => {
      const v = rows[i].values[s.key];
      const yTop = py(acc + v);
      const yBottom = py(acc) - (j > 0 ? GAP : 0);
      out.push({ key: s.key, color: s.color, y: yTop, h: Math.max(0, yBottom - yTop), top: j === visible.length - 1 });
      acc += v;
    });
    return out;
  }

  /** A rectangle with a 4px rounded top, square at the bottom. */
  function topRounded(x: number, yTop: number, w: number, h: number): string {
    const r = Math.min(4, h, w / 2);
    return `M${x},${yTop + h} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + w - r} Q${x + w},${yTop} ${x + w},${yTop + r} V${yTop + h} Z`;
  }

  function fmt(v: number): string {
    return `${v}${unit ? ` ${unit}` : ''}`;
  }
</script>

<div class="chart">
  <div class="legend chart-legend">
    {#each series as s (s.key)}
      <span><i class="swatch" style:background={s.color}></i>{s.label}</span>
    {/each}
  </div>
  <div class="chart-plot" bind:clientWidth={width}>
    <svg {width} height={H} role="img" aria-label={label}>
      {#each y.ticks as t (t)}
        <line class="grid" x1={M.left} x2={M.left + plotW} y1={py(t)} y2={py(t)} />
        <text class="tick" x={M.left - 8} y={py(t)} text-anchor="end" dominant-baseline="central">{t}</text>
      {/each}
      {#each rows as row, i (row.key)}
        {@const cx = M.left + band * i + band / 2}
        <g class="column" class:active={active === i}>
          {#each segments(i) as seg (seg.key)}
            {#if seg.top}
              <path d={topRounded(cx - colW / 2, seg.y, colW, seg.h)} fill={seg.color} />
            {:else}
              <rect x={cx - colW / 2} y={seg.y} width={colW} height={seg.h} fill={seg.color} />
            {/if}
          {/each}
          {#if i % every === 0}
            <text class="tick" x={cx} y={H - 8} text-anchor="middle">{row.label}</text>
          {/if}
          <!-- The hit target is the whole band, not just the painted column. -->
          <rect
            class="hit"
            x={M.left + band * i}
            y={M.top}
            width={band}
            height={plotH}
            role="button"
            tabindex="0"
            aria-label="{row.label}: {series.map((s) => `${s.label} ${fmt(row.values[s.key] ?? 0)}`).join(', ')}"
            onpointerenter={() => (active = i)}
            onpointerleave={() => (active = null)}
            onfocus={() => (active = i)}
            onblur={() => (active = null)}
          />
        </g>
      {/each}
    </svg>
    {#if active !== null}
      {@const row = rows[active]}
      <div class="tooltip" style:left="{Math.min(M.left + band * active + band / 2 + 14, width - TOOLTIP_W)}px" style:top="{M.top}px">
        <span class="muted">{row.label}</span>
        {#each [...series].reverse() as s (s.key)}
          <span><strong>{fmt(row.values[s.key] ?? 0)}</strong><i class="key" style:background={s.color}></i>{s.label}</span>
        {/each}
      </div>
    {/if}
  </div>
</div>
