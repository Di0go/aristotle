<script lang="ts">
  // The shell: ribbon, sidebar, tabs, the current page, the status line and the terminal drawer, plus global shortcuts.
  import type { Component } from 'svelte';
  import { claude } from './lib/claude.svelte.ts';
  import { classes } from './lib/classes.svelte.ts';
  import { feed } from './lib/feed.svelte.ts';
  import { focus } from './lib/focus.svelte.ts';
  import { link, router } from './lib/router.svelte.ts';
  import { searchBox } from './lib/search.svelte.ts';
  import './lib/automatic.svelte.ts';
  import './lib/tabs.svelte.ts';
  import './lib/theme.svelte.ts';
  import AskPanel from './lib/AskPanel.svelte';
  import ContextMenu from './lib/ContextMenu.svelte';
  import HoverCard from './lib/HoverCard.svelte';
  import Lightbox from './lib/Lightbox.svelte';
  import Logo from './lib/Logo.svelte';
  import Ribbon from './lib/Ribbon.svelte';
  import Search from './lib/Search.svelte';
  import Sidebar from './lib/Sidebar.svelte';
  import StatusLine from './lib/StatusLine.svelte';
  import TabBar from './lib/TabBar.svelte';
  import TerminalDrawer from './lib/TerminalDrawer.svelte';
  import Now from './pages/Now.svelte';

  // Pages other than Now load on first visit (the map pages bring the graph layout engine with them).
  type Page = () => Promise<{ default: Component<Record<string, unknown>> }>;
  const pages: Record<string, Page> = {
    review: () => import('./pages/Practice.svelte') as never,
    train: () => import('./pages/Practice.svelte') as never,
    progress: () => import('./pages/Progress.svelte') as never,
    map: () => import('./pages/KnowledgeMap.svelte') as never,
    roadmaps: () => import('./pages/Roadmaps.svelte') as never,
    roadmap: () => import('./pages/Roadmap.svelte') as never,
    topic: () => import('./pages/Topic.svelte') as never,
    lesson: () => import('./pages/Lesson.svelte') as never,
    step: () => import('./pages/Step.svelte') as never,
    log: () => import('./pages/Log.svelte') as never,
    session: () => import('./pages/SessionView.svelte') as never,
    praxis: () => import('./pages/Praxis.svelte') as never,
    mission: () => import('./pages/Mission.svelte') as never,
    about: () => import('./pages/About.svelte') as never,
  };

  /** Each page's code, imported once: the same promise every time, so moving within a page (another step of the
   * class, another concept) updates it instead of building it again. */
  const loaded = new Map<string, ReturnType<Page>>();
  /** Each page's component once its code has arrived, and the pages whose code failed to load (a rebuilt app). */
  let components = $state<Record<string, Component<Record<string, unknown>>>>({});
  let failed = $state<Record<string, boolean>>({});

  let railOpen = $state(false);

  const route = $derived(router.route);
  /** #/topics has no page of its own: the roadmaps page has every topic in its table. */
  const pageName = $derived(route.page === 'topics' ? 'roadmaps' : route.page);
  /**
   * The component for the current route, read from the same route as its props: while the next page's code is still
   * on its way nothing is shown, rather than the previous page given the next page's props (which fetched
   * /api/sessions/undefined on the way from a session to the log).
   */
  const Current = $derived(pageName === 'now' ? null : components[pageName]);
  $effect(() => {
    if (pageName !== 'now') void load(pageName);
  });
  /** What the current page is told: its slug or id, and for a topic the selected concept. */
  const pageProps = $derived.by((): Record<string, unknown> => {
    const r = router.route;
    if (r.page === 'review') return { kind: 'review' };
    if (r.page === 'train') return { kind: 'train', slug: r.slug };
    if (r.page === 'topic') return { slug: r.slug, concept: r.concept };
    if (r.page === 'step') return { slug: r.slug, number: r.number };
    if ('slug' in r) return { slug: r.slug };
    if ('id' in r) return { id: r.id };
    return {};
  });
  /** A new slug or id remounts the page, so it never shows one record's state on another. */
  const pageKey = $derived('slug' in route ? route.slug : 'id' in route ? route.id : route.page);

  feed.start();
  claude.connect();

  function load(name: string): ReturnType<Page> {
    let page = loaded.get(name);
    if (!page) {
      page = pages[name]();
      page.then(
        (m) => {
          components[name] = m.default;
          failed[name] = false;
        },
        () => {
          // A chunk that failed to load (the app was rebuilt) is asked for again next time.
          loaded.delete(name);
          failed[name] = true;
        },
      );
      loaded.set(name, page);
    }
    return page;
  }

  function onKey(e: KeyboardEvent) {
    if (e.ctrlKey && e.key === '`') {
      e.preventDefault();
      claude.toggle();
    }
    if (e.key === 'Escape' && railOpen) railOpen = false;
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
  <div class="ribbon-col"><Ribbon /></div>
  <aside class="rail" class:open={railOpen} aria-label="Library">
    <Sidebar onnavigate={() => (railOpen = false)} />
  </aside>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" class:open={railOpen} onclick={() => (railOpen = false)}></div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="stage"
    onpointerenter={() => document.documentElement.classList.add('show-scroll')}
    onpointerleave={() => document.documentElement.classList.remove('show-scroll')}
  >
    <header class="mobile-bar">
      <button onclick={() => (railOpen = true)} aria-label="Open the library">
        <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 5h12M3 9h12M3 13h12" /></svg>
      </button>
      <a class="mobile-brand" href={link.now()}><Logo size={20} class="mobile-mark" />aristotle</a>
      {#if feed.pending}<a class="turn" href={classes.sittingHref() ?? link.now()}>Your turn</a>{/if}
      <button class="mobile-search" onclick={() => searchBox.toggle(true)} aria-label="Search">
        <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M7.5 3a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9M10.8 10.8l4 4" /></svg>
      </button>
    </header>
    <TabBar />
    <main class="page-area">
      {#if pageName === 'now'}
        <Now />
      {:else if Current}
        {#key pageKey}
          <Current {...pageProps} />
        {/key}
      {:else if failed[pageName]}
        <div class="page">
          <div class="empty-state">
            <h2>Aristotle was updated</h2>
            <p>This page needs the new version. <button class="link" onclick={() => location.reload()}>Reload</button></p>
          </div>
        </div>
      {/if}
    </main>
  </div>
  <div class="status-col"><StatusLine /></div>
</div>

<HoverCard />
<ContextMenu />
{#if focus.on}
  <button class="ghost small focus-exit" onclick={() => focus.toggle(false)} title="Show everything again (Esc or F)">Leave focus</button>
{/if}
<AskPanel />
<Search />
<Lightbox />

{#if claude.mounted}
  <TerminalDrawer />
{/if}
