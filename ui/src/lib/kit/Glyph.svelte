<script module lang="ts">
  // Small drawings of the things a pathway moves: molecules as balls and sticks in the usual atom colours, electrons
  // and protons, ATP with its phosphates, and the electron carriers. The flow figure uses them in its boxes, on its
  // arrows and rising out of a box. A name it doesn't know is drawn as a small chip with the name in it, so any
  // subject can use the same fields.

  /** "CO₂", "co2", "Co 2" all name the same glyph. */
  export function glyphKey(name: string): string {
    return name
      .toLowerCase()
      .replace(/[₀-₉]/g, (d) => String(d.charCodeAt(0) - 0x2080))
      .replace(/⁻/g, '-')
      .replace(/⁺/g, '+')
      .replace(/[\s_]/g, '');
  }

  const ALIASES: Record<string, string> = {
    e: 'electron',
    'e-': 'electron',
    electrons: 'electron',
    'h+': 'proton',
    protons: 'proton',
    oxygen: 'o2',
    water: 'h2o',
    carbondioxide: 'co2',
    nadh: 'nadh',
    fadh2: 'fadh2',
  };

  /** Half the width and half the height each glyph takes at scale 1, for laying it out. */
  const EXTENT: Record<string, [number, number]> = {
    electron: [6, 6],
    proton: [6, 6],
    o2: [15, 8],
    co2: [21, 7],
    h2o: [14, 11],
    glucose: [22, 22],
    pyruvate: [24, 19],
    atp: [36, 11],
    adp: [30, 11],
    nadh: [22, 12],
    fadh2: [24, 12],
  };

  export function glyphName(name: string): string {
    const k = glyphKey(name);
    return ALIASES[k] ?? k;
  }

  const NAMES: Record<string, string> = {
    electron: 'e⁻',
    proton: 'H⁺',
    o2: 'O₂',
    co2: 'CO₂',
    h2o: 'H₂O',
    atp: 'ATP',
    adp: 'ADP',
    nadh: 'NADH',
    fadh2: 'FADH₂',
  };

  /** How a glyph is written under it: its formula, or the name as given. */
  export function glyphCaption(name: string): string {
    return NAMES[glyphName(name)] ?? name;
  }

  /** [half width, half height] of the glyph for `name` at scale 1; a chip's grows with its text. */
  export function glyphExtent(name: string): [number, number] {
    return EXTENT[glyphName(name)] ?? [name.length * 2.9 + 7, 8];
  }
</script>

<script lang="ts">
  let {
    name,
    x = 0,
    y = 0,
    scale = 1,
    caption = false,
  }: { name: string; x?: number; y?: number; scale?: number; /** Write its formula under it. */ caption?: boolean } = $props();

  const kind = $derived(glyphName(name));

  // A regular hexagon for glucose's ring, flat side down, as it is drawn in a Haworth projection.
  const R = 12;
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return { x: R * Math.cos(a), y: R * Math.sin(a) };
  });
  /** Glucose's ring is five carbons and one oxygen (pyranose); the oxygen sits at the top right corner. */
  const RING_O = 5;
  /** A hydroxyl drawn outwards from each ring carbon but the one carrying CH₂OH. */
  const oh = [0, 1, 2, 3].map((i) => ({ from: hex[i], to: { x: hex[i].x * 1.75, y: hex[i].y * 1.75 } }));
</script>

{#snippet atom(cx: number, cy: number, r: number, el: string)}
  <circle class="atom" {cx} {cy} {r} style:fill="var(--atom-{el})" />
  <circle class="shine" cx={cx - r * 0.32} cy={cy - r * 0.32} r={r * 0.32} />
{/snippet}

{#snippet bond(x1: number, y1: number, x2: number, y2: number, double = false)}
  {#if double}
    {@const len = Math.hypot(x2 - x1, y2 - y1) || 1}
    {@const nx = (-(y2 - y1) / len) * 1.7}
    {@const ny = ((x2 - x1) / len) * 1.7}
    <line class="bond" x1={x1 + nx} y1={y1 + ny} x2={x2 + nx} y2={y2 + ny} />
    <line class="bond" x1={x1 - nx} y1={y1 - ny} x2={x2 - nx} y2={y2 - ny} />
  {:else}
    <line class="bond" {x1} {y1} {x2} {y2} />
  {/if}
{/snippet}

{#snippet carrier(label: string)}
  <!-- An electron carrier: the molecule as a chip, holding its two electrons. -->
  {@const w = label.length * 6.4 + 12}
  <rect class="chip carrier" x={-w / 2} y="-7" width={w} height="14" rx="7" />
  <text class="chip-text" y="3.2" text-anchor="middle">{label}</text>
  <circle class="electron" cx={w / 2 - 1} cy="-7" r="3.2" />
  <circle class="electron" cx={w / 2 + 6} cy="-3" r="3.2" />
{/snippet}

<g class="glyph" transform="translate({x},{y}) scale({scale})">
  {#if kind === 'electron'}
    <circle class="electron" r="5.5" />
    <line class="sign" x1="-2.6" x2="2.6" y1="0" y2="0" />
  {:else if kind === 'proton'}
    <circle class="proton" r="5.5" />
    <line class="sign" x1="-2.6" x2="2.6" y1="0" y2="0" />
    <line class="sign" x1="0" x2="0" y1="-2.6" y2="2.6" />
  {:else if kind === 'o2'}
    {@render bond(-7, 0, 7, 0, true)}
    {@render atom(-7, 0, 7, 'o')}
    {@render atom(7, 0, 7, 'o')}
  {:else if kind === 'co2'}
    {@render bond(-14, 0, 0, 0, true)}
    {@render bond(0, 0, 14, 0, true)}
    {@render atom(-14, 0, 6.5, 'o')}
    {@render atom(14, 0, 6.5, 'o')}
    {@render atom(0, 0, 6.5, 'c')}
  {:else if kind === 'h2o'}
    <!-- Bent, about 104.5° between the two hydrogens. -->
    {@render bond(0, -3, -9, 6)}
    {@render bond(0, -3, 9, 6)}
    {@render atom(-9, 6, 4.6, 'h')}
    {@render atom(9, 6, 4.6, 'h')}
    {@render atom(0, -3, 7.5, 'o')}
  {:else if kind === 'glucose'}
    {#each hex as p, i (i)}{@render bond(p.x, p.y, hex[(i + 1) % 6].x, hex[(i + 1) % 6].y)}{/each}
    {#each oh as b, i (i)}{@render bond(b.from.x, b.from.y, b.to.x, b.to.y)}{/each}
    <!-- C5 carries C6, the CH₂OH outside the ring. -->
    {@render bond(hex[4].x, hex[4].y, hex[4].x, hex[4].y - 9)}
    {@render bond(hex[4].x, hex[4].y - 9, hex[4].x - 7, hex[4].y - 13)}
    {#each oh as b, i (i)}{@render atom(b.to.x, b.to.y, 3.4, 'o')}{/each}
    {@render atom(hex[4].x - 7, hex[4].y - 13, 3.4, 'o')}
    {@render atom(hex[4].x, hex[4].y - 9, 3.6, 'c')}
    {#each hex as p, i (i)}{@render atom(p.x, p.y, i === RING_O ? 4.6 : 3.9, i === RING_O ? 'o' : 'c')}{/each}
  {:else if kind === 'pyruvate'}
    <!-- CH₃–CO–COO⁻: three carbons, a ketone oxygen and the carboxylate. -->
    {@render bond(-14, 5, 0, -2)}
    {@render bond(0, -2, 14, 5)}
    {@render bond(0, -2, 0, -14, true)}
    {@render bond(14, 5, 23, -2, true)}
    {@render bond(14, 5, 15, 16)}
    {@render atom(0, -14, 5, 'o')}
    {@render atom(23, -2, 5, 'o')}
    {@render atom(15, 16, 5, 'o')}
    {@render atom(-14, 5, 6, 'c')}
    {@render atom(0, -2, 6, 'c')}
    {@render atom(14, 5, 6, 'c')}
  {:else if kind === 'atp' || kind === 'adp'}
    <!-- Adenine and ribose, then the phosphate tail: three for ATP, two for ADP. -->
    {@const n = kind === 'atp' ? 3 : 2}
    {@const x0 = kind === 'atp' ? -6 : 0}
    {@render bond(x0 - 22, 0, x0 - 9, 0)}
    {#each Array(n) as _, i (i)}{@render bond(x0 - 9 + i * 12, 0, x0 + 3 + i * 12, 0)}{/each}
    <polygon class="base" points={hex.map((p) => `${x0 - 24 + p.x * 0.85},${p.y * 0.85}`).join(' ')} />
    <polygon
      class="sugar"
      points={Array.from({ length: 5 }, (_, i) => {
        const a = ((Math.PI * 2) / 5) * i - Math.PI / 2;
        return `${x0 - 8 + 7 * Math.cos(a)},${7 * Math.sin(a)}`;
      }).join(' ')}
    />
    {#each Array(n) as _, i (i)}{@render atom(x0 + 4 + i * 12, 0, 5.4, 'p')}{/each}
  {:else if kind === 'nadh'}
    {@render carrier('NADH')}
  {:else if kind === 'fadh2'}
    {@render carrier('FADH₂')}
  {:else}
    {@const w = name.length * 5.8 + 14}
    <rect class="chip" x={-w / 2} y="-8" width={w} height="16" rx="8" />
    <text class="chip-text" y="3.4" text-anchor="middle">{name}</text>
  {/if}
  {#if caption && EXTENT[kind]}
    <text class="caption" y={EXTENT[kind][1] + 10} text-anchor="middle">{glyphCaption(name)}</text>
  {/if}
</g>

<style>
  .atom {
    stroke: var(--atom-edge);
    stroke-width: 0.9;
  }

  .shine {
    fill: #fff;
    opacity: 0.38;
    pointer-events: none;
  }

  .bond {
    stroke: var(--fg-2);
    stroke-width: 1.6;
    stroke-linecap: round;
  }

  .electron {
    fill: var(--electron);
    stroke: var(--atom-edge);
    stroke-width: 0.8;
  }

  .proton {
    fill: var(--atom-o);
    stroke: var(--atom-edge);
    stroke-width: 0.8;
  }

  .sign {
    stroke: #fff;
    stroke-width: 1.5;
    stroke-linecap: round;
  }

  .base {
    fill: color-mix(in srgb, var(--atom-n) 30%, transparent);
    stroke: var(--atom-n);
    stroke-width: 1.4;
  }

  .sugar {
    fill: color-mix(in srgb, var(--atom-c) 22%, transparent);
    stroke: var(--atom-c);
    stroke-width: 1.4;
  }

  .chip {
    fill: var(--b0);
    stroke: var(--rule-strong);
  }

  .chip.carrier {
    stroke: var(--electron);
  }

  .caption {
    fill: var(--fg-2);
    font: 600 9.5px var(--sans);
  }

  .chip-text {
    fill: var(--fg);
    font: 600 9px var(--sans);
  }
</style>
