<script lang="ts">
  // A gloss just asked for from the context menu: a card pinned under the selection, saying it is being written, then
  // the gloss, until he closes it (Escape, or a click anywhere else). Once the gloss exists the phrase is marked in the
  // page (Markdown.svelte), and the card hangs from that mark, so it stays with the word through any reflow. Aristotle's
  // own: the core's hover card shows what is under the pointer, never what is pinned.
  import { onMount } from 'svelte';
  import { feed } from './feed.svelte.ts';
  import { onDay } from './format.ts';
  import { glossing, type Anchor } from './gloss.svelte.ts';
  import { renderMarkdown } from './markdown.ts';
  import type { Gloss } from '../../../shared/types.ts';

  type Rect = { left: number; top: number; bottom: number; width: number };
  type Pos = { x: number; y: number; above: boolean };

  const WIDTH = 320;

  /** Bumped on scroll and resize, so the pinned card follows the words it hangs from. */
  let layout = $state(0);
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

  // Once the gloss exists, the phrase is marked in the page: hang the card from that mark, the one where the selection
  // was.
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

  onMount(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') glossing.close();
    };
    // The pinned card stays through hovering and reading; a click anywhere else puts it away.
    const down = (e: PointerEvent) => {
      if (glossing.pinned && !(e.target as Element | null)?.closest?.('.hovercard.pinned, .context-menu')) glossing.close();
    };
    const away = () => layout++;
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', down);
    addEventListener('scroll', away, { passive: true, capture: true });
    addEventListener('resize', away);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', down);
      removeEventListener('scroll', away, { capture: true });
      removeEventListener('resize', away);
    };
  });

  /** The first line of an element or range; null once it is gone from the page. */
  function lineRect(anchor: Anchor): DOMRect | null {
    const lines = [...anchor.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    return lines[0] ?? null;
  }

  /** Centred under the rectangle and kept inside the window; above it when there is no room below. */
  function placeAt(r: Rect): Pos {
    const x = Math.min(Math.max(12, r.left + r.width / 2 - WIDTH / 2), innerWidth - WIDTH - 12);
    const above = r.bottom + 220 > innerHeight && r.top > 240;
    return { x, y: above ? r.top - 8 : r.bottom + 8, above };
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
  <div class="hc-body hc-gloss md-box">{@html renderMarkdown(gloss.gloss)}</div>
  <p class="hc-meta hc-foot">
    <span>Glossed {onDay(gloss.at)}</span>
    <button
      class="link"
      onclick={() => {
        void glossing.remove(gloss.id);
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
        <p class="hc-body hc-wait"><span class="dot" aria-hidden="true"></span>Writing a gloss…</p>
      {:else}
        <p class="hc-body hc-error">{pin.error}</p>
      {/if}
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

  .hc-title {
    margin: 0;
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--fg);
  }

  .hc-body {
    margin: 4px 0 0;
    color: var(--fg-2);
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
