<script lang="ts">
  // The search palette: everything he has (roadmaps, steps, topics, concepts, missions, and what was said in
  // every session), searched on the server as he types. Arrows move, Enter opens, Escape closes.
  import { feed } from './feed.svelte.ts';
  import { link } from './router.svelte.ts';
  import { searchBox } from './search.svelte.ts';
  import type { SearchHit, SearchKind } from '../../../shared/types.ts';

  const KIND: Record<SearchKind, string> = {
    roadmap: 'Roadmap',
    step: 'Step',
    topic: 'Topic',
    concept: 'Concept',
    mission: 'Praxis',
    session: 'Session',
  };

  let q = $state('');
  let hits = $state<SearchHit[]>([]);
  let selected = $state(0);
  let loading = $state(false);
  let input = $state<HTMLInputElement>();
  let list = $state<HTMLElement>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Counts the searches sent, so a slow answer to an older one never replaces a newer one's. */
  let asked = 0;

  // On opening, select what was typed last time, so typing replaces it.
  // Text sent from elsewhere (the context menu) replaces it instead.
  $effect(() => {
    if (!searchBox.open) return;
    if (searchBox.seed) {
      q = searchBox.seed;
      searchBox.seed = null;
    }
    queueMicrotask(() => input?.select());
  });

  // Search as he types, once he pauses for 120 ms.
  $effect(() => {
    const query = q.trim();
    clearTimeout(timer);
    if (!query) {
      hits = [];
      loading = false;
      return;
    }
    loading = true;
    timer = setTimeout(async () => {
      const mine = ++asked;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (mine !== asked) return;
        hits = res.ok ? ((await res.json()) as SearchHit[]) : [];
        selected = 0;
      } finally {
        if (mine === asked) loading = false;
      }
    }, 120);
  });

  /** Where a hit leads. A step already studied opens its topic; one not started yet, its class. */
  function href(h: SearchHit): string {
    switch (h.kind) {
      case 'roadmap':
        return link.roadmap(h.slug!);
      case 'step':
        return feed.topics[h.slug!] ? link.topic(h.slug!) : link.lesson(h.slug!);
      case 'topic':
        return link.topic(h.slug!);
      case 'concept':
        return link.topic(h.slug!, h.concept);
      case 'mission':
        return link.mission(h.id!);
      case 'session':
        return link.session(h.slug!);
    }
  }

  function close() {
    searchBox.toggle(false);
  }

  function go(h: SearchHit | undefined) {
    if (!h) return;
    location.hash = href(h);
    close();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!hits.length) return;
      selected = (selected + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length;
      list?.querySelector(`[data-i="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(hits[selected]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  /** Ctrl+K anywhere, or / when not typing in a field. */
  function onWindowKey(e: KeyboardEvent) {
    const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable], .xterm') !== null;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchBox.toggle();
    } else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      searchBox.toggle(true);
    }
  }

  /** The words he typed, marked in a piece of text. Escaped first: the text comes from his data. */
  function mark(text: string): string {
    const escaped = text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const words = q
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 1)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return words.length ? escaped.replace(new RegExp(`(${words.join('|')})`, 'gi'), '<mark>$1</mark>') : escaped;
  }
</script>

<svelte:window onkeydown={onWindowKey} />

{#if searchBox.open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="veil" onclick={close}></div>
  <div class="palette" role="dialog" aria-label="Search" aria-modal="true">
    <div class="field">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 3.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10M12.2 12.2l4.3 4.3" /></svg>
      <input
        bind:this={input}
        bind:value={q}
        onkeydown={onKey}
        placeholder="Search roadmaps, concepts, missions, lessons…"
        aria-label="Search"
        aria-controls="search-results"
        aria-activedescendant={hits.length ? `hit-${selected}` : undefined}
        autocomplete="off"
        spellcheck="false"
      />
      <kbd>Esc</kbd>
    </div>
    <div class="results" id="search-results" role="listbox" bind:this={list}>
      {#each hits as h, i (i)}
        <a
          id="hit-{i}"
          data-i={i}
          class="hit"
          class:on={i === selected}
          href={href(h)}
          role="option"
          aria-selected={i === selected}
          onclick={(e) => {
            e.preventDefault();
            go(h);
          }}
          onpointermove={() => (selected = i)}
        >
          <span class="kind">{KIND[h.kind]}</span>
          <span class="body">
            <span class="title">{@html mark(h.title)}</span>
            {#if h.context}<span class="context">{h.context}</span>{/if}
            {#if h.snippet}<span class="snippet">{@html mark(h.snippet)}</span>{/if}
          </span>
        </a>
      {:else}
        <p class="none">
          {#if !q.trim()}Type to search everything you have learned, planned and written.{:else if loading}Searching…{:else}Nothing matches
            "{q.trim()}".{/if}
        </p>
      {/each}
    </div>
    <footer>
      <span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span
        ><kbd>Ctrl</kbd><kbd>K</kbd> or <kbd>/</kbd> search</span
      >
    </footer>
  </div>
{/if}

<style>
  .veil {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: rgb(0 0 0 / 0.28);
  }

  .palette {
    position: fixed;
    z-index: 81;
    top: 12vh;
    left: 50%;
    width: min(640px, calc(100vw - 32px));
    max-height: 72vh;
    display: flex;
    flex-direction: column;
    transform: translateX(-50%);
    background: var(--b0);
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--rule);
  }

  .field svg {
    flex: none;
    width: 18px;
    height: 18px;
    fill: none;
    stroke: var(--faint);
    stroke-width: 1.6;
    stroke-linecap: round;
  }

  .field input {
    flex: 1;
    min-width: 0;
    padding: 2px 0;
    border: 0;
    outline: none;
    background: none;
    font: 1rem var(--sans);
    color: var(--fg);
    box-shadow: none;
  }

  .results {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 6px;
  }

  .hit {
    display: flex;
    gap: 12px;
    padding: 9px 10px;
    border-radius: var(--radius);
    color: var(--fg);
    text-decoration: none;
  }

  .hit.on {
    background: var(--acc-soft);
  }

  .kind {
    flex: none;
    width: 4.6rem;
    padding-top: 2px;
    font-size: 0.74rem;
    font-weight: 500;
    color: var(--faint);
  }

  .hit.on .kind {
    color: var(--acc);
  }

  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .title {
    font-weight: 550;
  }

  .context {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .snippet {
    font-size: 0.84rem;
    line-height: 1.5;
    color: var(--fg-2);
    overflow-wrap: anywhere;
  }

  .body :global(mark) {
    color: inherit;
    background: var(--hl);
    border-radius: 2px;
  }

  .none {
    margin: 0;
    padding: 18px 12px;
    font-size: 0.9rem;
    color: var(--muted);
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    padding: 8px 14px;
    font-size: 0.76rem;
    color: var(--faint);
    border-top: 1px solid var(--rule);
  }

  footer kbd + kbd {
    margin-left: 2px;
  }

  @media (max-width: 640px) {
    .palette {
      top: 16px;
      max-height: calc(100vh - 32px);
    }

    footer {
      display: none;
    }
  }
</style>
