<script lang="ts">
  // Everything he has learned on one map: a box per topic, links where one topic builds on another.
  import { feed } from '../lib/feed.svelte.ts';
  import ConceptNode from '../lib/ConceptNode.svelte';
  import { layoutAll } from '../lib/layout.ts';
  import { link } from '../lib/router.svelte.ts';
  import { isFading, type Topic } from '../../../shared/types.ts';

  let topics = $state<Topic[] | null>(null);
  let width = $state(1000);
  let height = $state(600);
  let view = $state({ x: 0, y: 0, w: 1000, h: 600 });
  let fitted = false;
  let drag = $state<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  $effect(() => {
    void feed.topicVersion;
    void fetch('/api/map')
      .then((r) => r.json())
      .then((t: Topic[]) => (topics = t));
  });

  const all = $derived(topics ? layoutAll(topics.filter((t) => t.concepts.length > 0)) : null);
  const totals = $derived.by(() => {
    let solid = 0;
    let fading = 0;
    let concepts = 0;
    for (const t of topics ?? []) {
      for (const c of t.concepts) {
        concepts++;
        if (c.status === 'solid') solid++;
        if (isFading(c)) fading++;
      }
    }
    return { solid, fading, concepts };
  });

  /** Fit the whole map in the window, never zooming in past natural size. */
  function fit() {
    if (!all) return;
    const pad = 24;
    // Room at the bottom for the legend, in screen pixels.
    const legend = 56;
    const gw = all.layout.width + pad * 2;
    const gh = all.layout.height + pad * 2;
    const scale = Math.max(gw / width, gh / Math.max(height - legend, 100), 1);
    const w = width * scale;
    const h = height * scale;
    view = { x: (all.layout.width - w) / 2, y: (all.layout.height - (h - legend * scale)) / 2, w, h };
  }

  $effect(() => {
    if (all && !fitted && width > 0) {
      fitted = true;
      fit();
    }
  });

  // Keep the view's aspect equal to the window's when it resizes.
  $effect(() => {
    const ratio = height / width;
    if (Math.abs(view.h / view.w - ratio) > 0.001) view = { ...view, h: view.w * ratio };
  });

  function zoom(factor: number, cx = view.x + view.w / 2, cy = view.y + view.h / 2) {
    const w = Math.min(Math.max(view.w * factor, 200), (all?.layout.width ?? 1000) * 4 + 400);
    const k = w / view.w;
    view = { x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k, w, h: view.h * k };
  }

  function toView(e: { clientX: number; clientY: number }, svg: SVGSVGElement) {
    const r = svg.getBoundingClientRect();
    return { x: view.x + ((e.clientX - r.left) / r.width) * view.w, y: view.y + ((e.clientY - r.top) / r.height) * view.h };
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const p = toView(e, e.currentTarget as SVGSVGElement);
    zoom(Math.exp(e.deltaY * 0.0015), p.x, p.y);
  }

  function onDown(e: PointerEvent) {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
  }

  function onMove(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    drag.moved = true;
    view = { ...view, x: drag.vx - (dx * view.w) / width, y: drag.vy - (dy * view.h) / height };
  }

  function onUp() {
    drag = null;
  }

  function onKey(e: KeyboardEvent) {
    const step = view.w * 0.1;
    const moves: Record<string, () => void> = {
      '+': () => zoom(0.8),
      '=': () => zoom(0.8),
      '-': () => zoom(1.25),
      '0': fit,
      ArrowLeft: () => (view = { ...view, x: view.x - step }),
      ArrowRight: () => (view = { ...view, x: view.x + step }),
      ArrowUp: () => (view = { ...view, y: view.y - step }),
      ArrowDown: () => (view = { ...view, y: view.y + step }),
    };
    if (moves[e.key] && !(e.target as HTMLElement).closest('[role="button"], a')) {
      e.preventDefault();
      moves[e.key]();
    }
  }

  function open(key: string) {
    if (drag?.moved) return;
    const [slug, id] = key.split('/');
    location.hash = link.topic(slug, id);
  }
</script>

<div class="atlas">
  <header class="atlas-head">
    <div>
      <h1>Map</h1>
      <p class="muted">
        {totals.solid} of {totals.concepts} concepts solid{totals.fading ? `, ${totals.fading} fading` : ''}, across {all?.topics.length ?? 0}
        {all?.topics.length === 1 ? 'topic' : 'topics'}.
      </p>
    </div>
    <div class="atlas-controls">
      <button onclick={() => zoom(0.8)} aria-label="Zoom in">+</button>
      <button onclick={() => zoom(1.25)} aria-label="Zoom out">−</button>
      <button onclick={fit}>Fit</button>
    </div>
  </header>

  <div class="atlas-stage card" bind:clientWidth={width} bind:clientHeight={height}>
    {#if all && all.topics.length}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <svg
        class="map atlas-svg"
        class:dragging={drag?.moved}
        viewBox="{view.x} {view.y} {view.w} {view.h}"
        width={width}
        height={height}
        role="img"
        aria-label="Map of everything learned. Drag to move, scroll or use + and - to zoom, 0 to fit."
        tabindex="0"
        onwheel={onWheel}
        onpointerdown={onDown}
        onpointermove={onMove}
        onpointerup={onUp}
        onpointercancel={onUp}
        onkeydown={onKey}
      >
        <defs>
          <marker id="arrow-atlas" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,1 L9,5 L0,9 z" class="arrow" />
          </marker>
          <marker id="arrow-atlas-cross" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,1 L9,5 L0,9 z" class="arrow cross" />
          </marker>
        </defs>
        {#each all.topics as t (t.topic.slug)}
          {@const solid = t.topic.concepts.filter((c) => c.status === 'solid').length}
          <g class="topic-box">
            <rect x={t.x} y={t.y} width={t.w} height={t.h} rx="16" />
            <a href={link.topic(t.topic.slug)}>
              <text class="topic-title" x={t.x + 18} y={t.y + 22}>{t.topic.title}</text>
            </a>
            <text class="topic-count" x={t.x + t.w - 18} y={t.y + 22} text-anchor="end">{solid}/{t.topic.concepts.length}</text>
          </g>
        {/each}
        {#each all.layout.edges as e (e.key)}
          {@const cross = e.key.startsWith('x:')}
          <path d={e.d} class="edge" class:cross marker-end="url(#arrow-atlas{cross ? '-cross' : ''})" />
        {/each}
        {#each all.layout.nodes as node (node.key)}
          <ConceptNode {node} onclick={() => open(node.key)} />
        {/each}
      </svg>
      <div class="atlas-legend">
        <span><i class="dot solid"></i>Solid</span>
        <span><i class="dot fading"></i>Fading</span>
        <span><i class="dot shaky"></i>Shaky</span>
        <span><i class="dot unknown"></i>Not yet</span>
        <span><i class="cross-key"></i>Builds on another topic</span>
      </div>
    {:else if topics}
      <div class="empty">
        <h1>Nothing on the map yet</h1>
        <p>Every concept you learn appears here, grouped by topic. Start with <code>/teach</code> in Claude Code.</p>
      </div>
    {:else}
      <p class="muted">Loading…</p>
    {/if}
  </div>
</div>
