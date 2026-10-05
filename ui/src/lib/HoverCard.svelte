<script lang="ts">
  // One hover card for the whole app. Point at (or focus) a term with a definition, a glossed phrase, or anything
  // carrying data-concept="topic/id" (links in lessons, the library tree, the outline, the graph), and a small card
  // shows what it is: the definition or gloss, or the concept's summary, state, prerequisites and review date.
  // A gloss just asked for from the context menu gets a card pinned under the selection until he closes it.
  import { onMount } from 'svelte';
  import { feed } from './feed.svelte.ts';
  import { formatDay, onDay } from './format.ts';
  import { glossing, type Anchor } from './gloss.svelte.ts';
  import { splitRef } from './library.ts';
  import { renderInline, renderMarkdown } from './markdown.ts';
  import { isFading, type Concept, type Gloss, type Topic } from '../../../shared/types.ts';

  type Card =
    | { kind: 'term'; title: string; html: string }
    | { kind: 'gloss'; gloss: Gloss }
    | { kind: 'concept'; topic: Topic; concept: Concept }
    | { kind: 'missing'; ref: string };
  type Rect = { left: number; top: number; bottom: number; width: number };
  type Pos = { x: number; y: number; above: boolean };

  const WIDTH = 320;
  const SELECTOR = '.term[data-def], .gloss[data-gloss], [data-concept]';
  const STATE = { solid: 'Solid', shaky: 'Shaky', unknown: 'Not yet' } as const;

  let card = $state<Card | null>(null);
  let pos = $state({ x: 0, y: 0, above: false });
  /** Bumped on scroll and resize, so the pinned card follows the words it hangs from. */
  let layout = $state(0);
  /** Where the pointer is, to put a hover card under the line it points at when a term wraps onto two. */
  let pointerY: number | undefined;
  /** The pinned card's last good place, kept while its anchor is between the selection and the marked phrase. */
  let lastPin: Pos | null = null;
  /** The pinned gloss card's place, under (or over) the words it is for. */
  const pinPos = $derived.by(() => {
    void layout;
    const pin = glossing.pinned;
    if (!pin) return (lastPin = null);
    const r = lineRect(pin.anchor);
    if (r) lastPin = placeAt(r);
    return lastPin;
  });

  // Once the gloss exists, the phrase is marked in the page (Markdown.svelte): hang the card from that mark, the
  // one where the selection was, so it stays with the word through any reflow.
  $effect(() => {
    const pin = glossing.pinned;
    void feed.glosses;
    if (pin?.state !== 'done' || pin.anchor instanceof HTMLElement) return;
    const at = lastPin;
    requestAnimationFrame(() => {
      const marks = [...document.querySelectorAll<HTMLElement>(`.gloss[data-gloss="${CSS.escape(pin.gloss.id)}"]`)];
      if (!marks.length || !at) return;
      const distance = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return Math.abs(r.left + r.width / 2 - (at.x + WIDTH / 2)) + Math.abs((at.above ? r.top - 8 : r.bottom + 8) - at.y);
      };
      glossing.reanchor(marks.reduce((a, b) => (distance(b) < distance(a) ? b : a)));
    });
  });
  /** The element the card is for. */
  let target: HTMLElement | null = null;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  // Delegated listeners on the document, so anything rendered anywhere, at any time, gets a card. Focus works
  // like pointing, for the keyboard.
  onMount(() => {
    const over = (e: Event) => {
      pointerY = e instanceof PointerEvent ? e.clientY : undefined;
      const el = (e.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null;
      if (el) show(el);
      else if (!(e.target as Element | null)?.closest?.('.hovercard')) hide();
    };
    // Moving onto the card itself, or straight onto another target, keeps it up.
    const out = (e: PointerEvent) => {
      const to = e.relatedTarget as Element | null;
      if (to?.closest?.('.hovercard') || to?.closest?.(SELECTOR)) return;
      if ((e.target as Element | null)?.closest?.(SELECTOR)) hide();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      hide(false);
      glossing.close();
    };
    // The pinned card stays through hovering and reading; a click anywhere else puts it away.
    const down = (e: PointerEvent) => {
      if (glossing.pinned && !(e.target as Element | null)?.closest?.('.hovercard.pinned, .context-menu')) glossing.close();
    };
    const leave = () => hide();
    const away = () => {
      hide(false);
      layout++;
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('focusin', over);
    document.addEventListener('focusout', leave);
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', down);
    addEventListener('scroll', away, { passive: true, capture: true });
    addEventListener('resize', away);
    return () => {
      removeEventListener('resize', away);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('focusin', over);
      document.removeEventListener('focusout', leave);
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', down);
      removeEventListener('scroll', away, { capture: true });
    };
  });

  function build(el: HTMLElement): Card | null {
    if (el.matches('.gloss[data-gloss]')) {
      const gloss = feed.glosses.find((g) => g.id === el.dataset.gloss);
      return gloss ? { kind: 'gloss', gloss } : null;
    }
    if (el.matches('.term[data-def]')) {
      return { kind: 'term', title: el.textContent ?? '', html: renderInline(el.dataset.def ?? '') };
    }
    const ref = el.dataset.concept ?? '';
    const { topic: slug = '', concept: id } = splitRef(ref);
    const topic = feed.topics[slug];
    const concept = topic?.concepts.find((c) => c.id === id);
    if (!topic || !concept) return el.classList.contains('concept-link') ? { kind: 'missing', ref } : null;
    return { kind: 'concept', topic, concept };
  }

  function place(el: HTMLElement) {
    pos = placeAt(lineRect(el, pointerY) ?? el.getBoundingClientRect());
  }

  /** The line of a (possibly wrapped) element or range nearest y, or its first line; null once it is gone from the page. */
  function lineRect(anchor: Anchor, y?: number): DOMRect | null {
    const lines = [...anchor.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (!lines.length) return null;
    if (y === undefined) return lines[0];
    return lines.reduce((a, b) => (Math.abs(b.top + b.height / 2 - y) < Math.abs(a.top + a.height / 2 - y) ? b : a));
  }

  /** Centred under the rectangle and kept inside the window; above it when there is no room below. */
  function placeAt(r: Rect): Pos {
    const x = Math.min(Math.max(12, r.left + r.width / 2 - WIDTH / 2), innerWidth - WIDTH - 12);
    const above = r.bottom + 220 > innerHeight && r.top > 240;
    return { x, y: above ? r.top - 8 : r.bottom + 8, above };
  }

  /**
   * After a short pause, so sweeping the pointer across a page doesn't flash cards; quicker when one is already
   * up and the pointer moves to the next.
   */
  function show(el: HTMLElement) {
    clearTimeout(hideTimer);
    if (target === el && card) return;
    clearTimeout(showTimer);
    showTimer = setTimeout(
      () => {
        const c = build(el);
        if (!c) return;
        target = el;
        card = c;
        place(el);
      },
      card ? 60 : 280,
    );
  }

  /** Soon rather than at once, so the pointer can cross the gap onto the card. */
  function hide(soon = true) {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(
      () => {
        card = null;
        target = null;
      },
      soon ? 160 : 0,
    );
  }

  /** The labels of what a concept builds on, looked up across topics. */
  function deps(topic: Topic, c: Concept): string[] {
    return c.deps.map((d) => {
      const { topic: slug = topic.slug, concept: id } = splitRef(d);
      return feed.topics[slug]?.concepts.find((x) => x.id === id)?.label ?? id;
    });
  }

  /** The state tag's colour: solid or shaky (fading is still solid, as on the map); not-yet stays plain. */
  function tagClass(c: Concept): string {
    return c.status === 'unknown' ? '' : c.status;
  }
</script>

{#snippet glossBody(gloss: Gloss)}
  <p class="hc-title">{gloss.text}</p>
  {#if gloss.image}
    <figure class="hc-image">
      <img src={gloss.image.src} alt={gloss.image.alt} loading="lazy" />
      <figcaption><a href={gloss.image.page} target="_blank" rel="noreferrer">{gloss.image.credit}</a></figcaption>
    </figure>
  {/if}
  <div class="hc-body hc-gloss">{@html renderMarkdown(gloss.gloss)}</div>
  <p class="hc-meta hc-foot">
    <span>Glossed by Claude {onDay(gloss.at)}</span>
    <button
      class="link"
      onclick={() => {
        void glossing.remove(gloss.id);
        hide(false);
      }}
      title="Forget this gloss: the phrase goes back to plain text">Forget</button
    >
  </p>
{/snippet}

{#if glossing.pinned && pinPos}
  {@const pin = glossing.pinned}
  <div
    class="hovercard pinned"
    class:above={pinPos.above}
    style:left="{pinPos.x}px"
    style:top="{pinPos.y}px"
    style:width="{WIDTH}px"
    role="dialog"
    aria-label="Gloss of {pin.text}"
  >
    {#if pin.state === 'done'}
      {@render glossBody(pin.gloss)}
    {:else}
      <p class="hc-title">{pin.text}</p>
      {#if pin.state === 'loading'}
        <p class="hc-body hc-wait"><span class="dot" aria-hidden="true"></span>Claude is writing a gloss…</p>
      {:else}
        <p class="hc-body hc-error">{pin.error}</p>
      {/if}
    {/if}
  </div>
{:else if card}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="hovercard"
    class:above={pos.above}
    style:left="{pos.x}px"
    style:top="{pos.y}px"
    style:width="{WIDTH}px"
    role="tooltip"
    onpointerenter={() => clearTimeout(hideTimer)}
    onpointerleave={() => hide()}
  >
    {#if card.kind === 'term'}
      <p class="hc-title">{card.title}</p>
      <p class="hc-body">{@html card.html}</p>
    {:else if card.kind === 'gloss'}
      {@render glossBody(card.gloss)}
    {:else if card.kind === 'concept'}
      {@const c = card.concept}
      {@const fading = isFading(c)}
      <div class="hc-head">
        <p class="hc-title">{c.label}</p>
        <span class="tag {tagClass(c)}">{fading ? 'Fading' : STATE[c.status]}</span>
      </div>
      <p class="hc-where">{card.topic.title}{c.goal ? ' · a goal of this topic' : ''}</p>
      {#if c.summary}<p class="hc-body">{c.summary}</p>{/if}
      {#if c.note && c.status !== 'solid'}<p class="hc-note">{c.note}</p>{/if}
      {#if c.deps.length}<p class="hc-meta">Builds on {deps(card.topic, c).join(', ')}</p>{/if}
      {#if c.status === 'solid' && c.review}
        <p class="hc-meta">{fading ? `Due for review since ${formatDay(c.review.due)}` : `Next review ${onDay(c.review.due)}`}</p>
      {:else if c.evidence.length}
        <p class="hc-meta">Last checked {onDay(c.evidence.at(-1)!.at)}</p>
      {/if}
    {:else}
      <p class="hc-title">{card.ref.split('/').at(-1)?.replace(/-/g, ' ')}</p>
      <p class="hc-meta">Not on any map yet.</p>
    {/if}
  </div>
{/if}

<style>
  .hovercard {
    position: fixed;
    z-index: 60;
    padding: 12px 14px;
    background: var(--b0);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    font-size: 0.86rem;
    line-height: 1.55;
    animation: pop 0.14s var(--ease);
  }

  .hovercard.above {
    transform: translateY(-100%);
    animation-name: pop-up;
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
  }

  @keyframes pop-up {
    from {
      opacity: 0;
      transform: translateY(calc(-100% + 3px));
    }
  }

  .hc-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  .hc-title {
    margin: 0;
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--fg);
  }

  .hc-where {
    margin: 0 0 6px;
    font-size: 0.78rem;
    color: var(--faint);
  }

  .hc-body {
    margin: 4px 0 0;
    color: var(--fg-2);
  }

  .hc-note {
    margin: 8px 0 0;
    padding: 6px 10px;
    border-radius: 6px;
    background: var(--shaky-soft);
    color: var(--fg-2);
    font-size: 0.82rem;
  }

  .hc-meta {
    margin: 8px 0 0;
    font-size: 0.78rem;
    color: var(--faint);
  }

  .hc-gloss :global(p) {
    margin: 0 0 6px;
  }

  .hc-gloss :global(p:last-child) {
    margin-bottom: 0;
  }

  .hc-image {
    margin: 8px 0 6px;
  }

  .hc-image img {
    display: block;
    width: 100%;
    max-height: 180px;
    object-fit: contain;
    border-radius: var(--radius);
    background: var(--b1);
  }

  .hc-image figcaption {
    margin-top: 3px;
    font-size: 0.7rem;
    line-height: 1.3;
  }

  .hc-image figcaption a {
    color: var(--faint);
  }

  .hc-foot {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }

  .hc-foot .link {
    font-size: inherit;
    color: var(--faint);
  }

  .hc-foot .link:hover {
    color: var(--fg-2);
  }

  .hc-wait {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--acc);
    animation: breathe 1.1s ease-in-out infinite alternate;
  }

  @keyframes breathe {
    from {
      opacity: 0.25;
    }
  }

  .hc-error {
    color: var(--wrong);
  }
</style>
