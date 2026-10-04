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
  import Progress from './pages/Progress.svelte';
  import KnowledgeMap from './pages/KnowledgeMap.svelte';
  import Topic from './pages/Topic.svelte';
  import Roadmaps from './pages/Roadmaps.svelte';
  import Roadmap from './pages/Roadmap.svelte';
  import Log from './pages/Log.svelte';
  import SessionView from './pages/SessionView.svelte';
  import Lesson from './pages/Lesson.svelte';

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
      <a class="mobile-brand" href={link.now()}>mind-gym</a>
      {#if feed.pending}<a class="turn" href={link.now()}>Your turn</a>{/if}
    </header>
    <TabBar />
    <main class="page-area">
      {#if route.page === 'now'}
        <Now />
      {:else if route.page === 'progress'}
        <Progress />
      {:else if route.page === 'map'}
        <KnowledgeMap />
      {:else if route.page === 'roadmaps'}
        <Roadmaps />
      {:else if route.page === 'roadmap'}
        {#key route.slug}<Roadmap slug={route.slug} />{/key}
      {:else if route.page === 'topics'}
        <Roadmaps />
      {:else if route.page === 'topic'}
        {#key route.slug}<Topic slug={route.slug} concept={route.concept} />{/key}
      {:else if route.page === 'lesson'}
        {#key route.slug}<Lesson slug={route.slug} />{/key}
      {:else if route.page === 'log'}
        <Log />
      {:else}
        {#key route.id}<SessionView id={route.id} />{/key}
      {/if}
    </main>
  </div>
  <div class="status-col"><StatusLine /></div>
</div>

<HoverCard />

{#if claude.mounted}
  <TerminalDrawer />
{/if}
