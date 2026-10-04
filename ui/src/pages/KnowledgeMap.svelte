<script lang="ts">
  // Everything on one map, organised like the library: a band per roadmap with its steps in order,
  // a box per topic with its concepts inside, and links where one topic builds on another.
  import { feed } from '../lib/feed.svelte.ts';
  import ConceptNode from '../lib/ConceptNode.svelte';
  import { layoutAtlas } from '../lib/layout.ts';
  import { link } from '../lib/router.svelte.ts';
  import { isFading, type Topic } from '../../../shared/types.ts';

  let width = $state(0);
  let height = $state(0);
  let view = $state({ x: 0, y: 0, w: 1000, h: 600 });
  /** The size last fitted to; the map refits when it changes, until he moves or zooms it himself. */
  let fittedTo = '';
  let interacted = false;
  let drag = $state<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  const topics = $derived(feed.loaded ? (Object.values(feed.topics) as Topic[]) : null);
  const all = $derived(feed.loaded ? layoutAtlas(feed.roadmapList, feed.topics) : null);

  let hovered = $state<string | null>(null);
  const lit = $derived.by(() => {
    if (!hovered || !all) return null;
    const set = new Set([hovered]);
    for (const e of all.layout.edges) {
      if (e.from === hovered) set.add(e.to);
      if (e.to === hovered) set.add(e.from);
    }
    return set;
  });
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
    const size = all ? `${all.layout.width}x${all.layout.height}:${width}x${height}` : '';
    if (all && all.boxes.length && width > 0 && height > 0 && size !== fittedTo && !interacted) {
      fittedTo = size;
      fit();
    }
  });

  // Keep the view's aspect equal to the window's when it resizes.
  $effect(() => {
    const ratio = height / width;
    if (Math.abs(view.h / view.w - ratio) > 0.001) view = { ...view, h: view.w * ratio };
  });

  function zoom(factor: number, cx = view.x + view.w / 2, cy = view.y + view.h / 2) {
    interacted = true;
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
    interacted = true;
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

  /** Shortens a title to fit a width in the 14px Inter. */
  function fitTitle(title: string, px: number): string {
    const max = Math.floor(px / 7.6);
    return title.length > max ? `${title.slice(0, max - 1)}…` : title;
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
      <h1 class="page-title">Map</h1>
      <p class="muted atlas-sub">
        {totals.solid} of {totals.concepts} concepts solid{totals.fading ? `, ${totals.fading} fading` : ''}. Point at a concept to see what it builds on and what builds on it.
      </p>
    </div>
    <div class="atlas-controls">
      <button class="ghost small" onclick={() => zoom(0.8)} aria-label="Zoom in">+</button>
      <button class="ghost small" onclick={() => zoom(1.25)} aria-label="Zoom out">−</button>
      <button class="ghost small" onclick={() => { interacted = false; fit(); }}>Fit</button>
    </div>
  </header>

  <div class="atlas-stage graph-paper" bind:clientWidth={width} bind:clientHeight={height}>
    {#if all && all.boxes.length}
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
        {#each all.bands as b (b.key)}
          <g class="band">
            {#if b.roadmap}
              <a href={link.roadmap(b.roadmap.slug)}><text class="band-title" x={b.x + 20} y={b.y + 22}>{b.title}</text></a>
            {:else}
              <a href={link.topics()}><text class="band-title" x={b.x + 20} y={b.y + 22}>{b.title}</text></a>
            {/if}
            <line class="band-rule" x1={b.x + 20} x2={b.x + b.w - 20} y1={b.y + 34} y2={b.y + 34} />
            {#if b.route}<path class="route-line" d={b.route} />{/if}
          </g>
        {/each}
        {#each all.boxes as box (box.key)}
          {@const slug = box.topic?.slug ?? box.step?.topic ?? ''}
          {@const solid = box.topic?.concepts.filter((c) => c.status === 'solid').length ?? 0}
          <g class="topic-box" class:unstarted={!box.topic}>
            <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="10" />
            {#if box.number}
              <circle class="step-badge" cx={box.x + 22} cy={box.y} r="11" />
              <text class="step-num" x={box.x + 22} y={box.y} dominant-baseline="central" text-anchor="middle">{box.number}</text>
            {/if}
            <a href={link.topic(slug)}>
              <text class="topic-title" x={box.x + (box.number ? 42 : 18)} y={box.y + 27}>{fitTitle(box.title, box.w - (box.number ? 60 : 36))}</text>
            </a>
            {#if box.topic}
              <text class="topic-count" x={box.x + box.w - 16} y={box.y + 27} text-anchor="end">{solid}/{box.topic.concepts.length}</text>
            {:else}
              <text class="ghost-note" x={box.x + 18} y={box.y + 56}>Not started</text>
            {/if}
          </g>
        {/each}
        {#each all.layout.edges as e (e.key)}
          {@const cross = e.key.startsWith('x:')}
          <path
            d={e.d}
            class="edge"
            class:cross
            class:dim={lit && !((lit.has(e.from) && e.to === hovered) || (lit.has(e.to) && e.from === hovered))}
            marker-end="url(#arrow-atlas{cross ? '-cross' : ''})"
          />
        {/each}
        {#each all.layout.nodes as node (node.key)}
          <ConceptNode
            {node}
            focused={feed.topics[node.key.split('/')[0]]?.focus === node.key.split('/')[1]}
            dim={lit ? !lit.has(node.key) : false}
            onhover={(on) => (hovered = on ? node.key : hovered === node.key ? null : hovered)}
            onclick={() => open(node.key)}
          />
        {/each}
      </svg>
      <div class="atlas-legend">
        <span><i class="dot solid"></i>Solid</span>
        <span><i class="dot fading"></i>Fading</span>
        <span><i class="dot shaky"></i>Shaky</span>
        <span><i class="dot"></i>Not yet</span>
        <span><i class="goal-key"></i>Goal</span>
        <span><i class="cross-key"></i>Builds on another topic</span>
      </div>
    {:else if topics}
      <div class="empty-state atlas-empty">
        <h2>Nothing on the map yet</h2>
        <p>Every concept you learn appears here, grouped by roadmap and topic. Start a lesson from Now, or plan a roadmap.</p>
      </div>
    {:else}
      <p class="muted">Loading…</p>
    {/if}
  </div>
</div>
