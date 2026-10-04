<script lang="ts">
  import { feed } from './lib/feed.svelte.ts';
  import { claude } from './lib/claude.svelte.ts';
  import './lib/theme.svelte.ts';
  import TerminalDrawer from './lib/TerminalDrawer.svelte';
  import Sidebar from './lib/Sidebar.svelte';
  import Ribbon from './lib/Ribbon.svelte';
  import TabBar from './lib/TabBar.svelte';
  import StatusLine from './lib/StatusLine.svelte';
  import HoverCard from './lib/HoverCard.svelte';
  import './lib/tabs.svelte.ts';
  import { link, router } from './lib/router.svelte.ts';
  import Now from './pages/Now.svelte';

  // Pages other than Now load on first visit (the map pages bring the graph layout engine with them).
  import type { Component } from 'svelte';
  type Page = () => Promise<{ default: Component<Record<string, unknown>> }>;
  const pages: Record<string, Page> = {
    progress: () => import('./pages/Progress.svelte') as never,
    map: () => import('./pages/KnowledgeMap.svelte') as never,
    roadmaps: () => import('./pages/Roadmaps.svelte') as never,
    roadmap: () => import('./pages/Roadmap.svelte') as never,
    topic: () => import('./pages/Topic.svelte') as never,
    lesson: () => import('./pages/Lesson.svelte') as never,
    log: () => import('./pages/Log.svelte') as never,
    session: () => import('./pages/SessionView.svelte') as never,
  };
  /** What the current page is told: its slug or id, and for a topic the selected concept. */
  const pageProps = $derived.by((): Record<string, unknown> => {
    const r = router.route;
    if (r.page === 'topic') return { slug: r.slug, concept: r.concept };
    if ('slug' in r) return { slug: r.slug };
    if ('id' in r) return { id: r.id };
    return {};
  });

  feed.start();
  claude.connect();

  let railOpen = $state(false);

  function onKey(e: KeyboardEvent) {
    if (e.ctrlKey && e.key === '`') {
      e.preventDefault();
      claude.toggle();
    }
    if (e.key === 'Escape' && railOpen) railOpen = false;
  }

  const route = $derived(router.route);
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
  <div class="ribbon-col"><Ribbon /></div>
  <aside class="rail" class:open={railOpen} aria-label="Library">
    <Sidebar onnavigate={() => (railOpen = false)} />
  </aside>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" class:open={railOpen} onclick={() => (railOpen = false)}></div>

  <div class="stage">
    <header class="mobile-bar">
      <button onclick={() => (railOpen = true)} aria-label="Open the library">
        <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 5h12M3 9h12M3 13h12" /></svg>
      </button>
      <a class="mobile-brand" href={link.now()}><svg class="mobile-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M22.6 9.2 A9 9 0 1 0 25 16.2" fill="none" stroke="var(--acc)" stroke-width="3.2" stroke-linecap="round" /><circle cx="16" cy="16" r="2.6" fill="currentColor" /></svg>mind-gym</a>
      {#if feed.pending}<a class="turn" href={link.now()}>Your turn</a>{/if}
    </header>
    <TabBar />
    <main class="page-area">
      {#if route.page === 'now'}
        <Now />
      {:else}
        {@const r = route}
        {#await pages[r.page === 'topics' ? 'roadmaps' : r.page]() then m}
          {#key 'slug' in r ? r.slug : 'id' in r ? r.id : r.page}
            <m.default {...pageProps} />
          {/key}
        {/await}
      {/if}
    </main>
  </div>
  <div class="status-col"><StatusLine /></div>
</div>

<HoverCard />

{#if claude.mounted}
  <TerminalDrawer />
{/if}
