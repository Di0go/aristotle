<script lang="ts">
  // One hover card for the whole app. Point at (or focus) a term with a definition, or anything carrying
  // data-concept="topic/id" (links in lessons, the library tree, the outline, the graph), and a small card
  // shows what it is: the definition, or the concept's summary, state, prerequisites and review date.
  import { onMount } from 'svelte';
  import { feed } from './feed.svelte.ts';
  import { renderInline } from './markdown.ts';
  import { formatDay, onDay } from './format.ts';
  import { isFading, type Concept, type Topic } from '../../../shared/types.ts';

  type Card =
    | { kind: 'term'; title: string; html: string }
    | { kind: 'concept'; topic: Topic; concept: Concept }
    | { kind: 'missing'; ref: string };

  let card = $state<Card | null>(null);
  let pos = $state({ x: 0, y: 0, above: false });
  let box = $state<HTMLDivElement>();
  let target: HTMLElement | null = null;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const WIDTH = 320;
  const SELECTOR = '.term[data-def], [data-concept]';

  function build(el: HTMLElement): Card | null {
    if (el.matches('.term[data-def]')) {
      return { kind: 'term', title: el.textContent ?? '', html: renderInline(el.dataset.def ?? '') };
    }
    const ref = el.dataset.concept ?? '';
    const [slug, id] = ref.split('/');
    const topic = feed.topics[slug];
    const concept = topic?.concepts.find((c) => c.id === id);
    if (!topic || !concept) return el.classList.contains('concept-link') ? { kind: 'missing', ref } : null;
    return { kind: 'concept', topic, concept };
  }

  function place(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(12, r.left + r.width / 2 - WIDTH / 2), innerWidth - WIDTH - 12);
    const above = r.bottom + 220 > innerHeight && r.top > 240;
    pos = { x, y: above ? r.top - 8 : r.bottom + 8, above };
  }

  function show(el: HTMLElement) {
    clearTimeout(hideTimer);
    if (target === el && card) return;
    clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      const c = build(el);
      if (!c) return;
      target = el;
      card = c;
      place(el);
    }, card ? 60 : 280);
  }

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

  onMount(() => {
    const over = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null;
      if (el) show(el);
      else if (!(e.target as Element | null)?.closest?.('.hovercard')) hide();
    };
    const out = (e: PointerEvent) => {
      const to = e.relatedTarget as Element | null;
      if (to?.closest?.('.hovercard') || to?.closest?.(SELECTOR)) return;
      if ((e.target as Element | null)?.closest?.(SELECTOR)) hide();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide(false);
    };
    const away = () => hide(false);
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('focusin', over);
    document.addEventListener('focusout', () => hide());
    document.addEventListener('keydown', key);
    addEventListener('scroll', away, { passive: true, capture: true });
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('focusin', over);
      document.removeEventListener('keydown', key);
      removeEventListener('scroll', away, { capture: true });
    };
  });

  const STATE = { solid: 'Solid', shaky: 'Shaky', unknown: 'Not yet' } as const;

  function deps(topic: Topic, c: Concept): string[] {
    return c.deps.map((d) => {
      const [slug, id] = d.includes('/') ? d.split('/') : [topic.slug, d];
      return feed.topics[slug]?.concepts.find((x) => x.id === id)?.label ?? id;
    });
  }
</script>

{#if card}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="hovercard"
    class:above={pos.above}
    bind:this={box}
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
    {:else if card.kind === 'concept'}
      {@const c = card.concept}
      {@const fading = isFading(c)}
      <div class="hc-head">
        <p class="hc-title">{c.label}</p>
        <span class="tag {fading ? '' : c.status === 'solid' ? 'solid' : c.status === 'shaky' ? 'shaky' : ''}">{fading ? 'Fading' : STATE[c.status]}</span>
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
</style>
