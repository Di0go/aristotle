<script lang="ts">
  import { feed } from './lib/feed.svelte.ts';
  import { claude } from './lib/claude.svelte.ts';
  import TerminalDrawer from './lib/TerminalDrawer.svelte';
  import { link, router } from './lib/router.svelte.ts';
  import Now from './pages/Now.svelte';
  import Progress from './pages/Progress.svelte';
  import KnowledgeMap from './pages/KnowledgeMap.svelte';
  import Topics from './pages/Topics.svelte';
  import Topic from './pages/Topic.svelte';
  import Log from './pages/Log.svelte';
  import SessionView from './pages/SessionView.svelte';

  feed.start();
  claude.connect();

  function onKey(e: KeyboardEvent) {
    if (e.ctrlKey && e.key === '`') {
      e.preventDefault();
      claude.toggle();
    }
  }

  const route = $derived(router.route);
  const section = $derived(
    route.page === 'topic' ? 'topics' : route.page === 'session' ? 'log' : route.page,
  );
</script>

<svelte:window onkeydown={onKey} />

<header class="topbar">
  <a class="brand" href={link.now()}><span class="logo" aria-hidden="true"></span>Mind Gym</a>
  <nav>
    <a href={link.now()} class:current={section === 'now'}>
      Now{#if feed.pending && section !== 'now'}<i class="badge" aria-label="waiting for you"></i>{/if}
    </a>
    <a href={link.progress()} class:current={section === 'progress'}>Progress</a>
    <a href={link.map()} class:current={section === 'map'}>Map</a>
    <a href={link.topics()} class:current={section === 'topics'}>Topics</a>
    <a href={link.log()} class:current={section === 'log'}>Log</a>
  </nav>
  <div class="status">
    {#if !feed.connected}
      <span class="pill offline">Offline</span>
    {:else if feed.pending}
      <a class="pill your-turn" href={link.now()}>Your turn</a>
    {/if}
    <button
      class="claude-button"
      class:active={claude.open}
      class:asking={claude.asking && !claude.open}
      onclick={() => claude.toggle()}
      title="Claude Code (Ctrl+`)"
      aria-label={claude.asking && !claude.open ? 'Claude is asking something' : 'Claude Code'}
      aria-expanded={claude.open}
    >
      <i class="run-dot" class:on={claude.running} class:busy={claude.activity && !claude.open}></i>
      <span class="claude-label">{claude.asking && !claude.open ? 'Claude asks' : 'Claude'}</span>
      <span class="claude-glyph" aria-hidden="true">›_</span>
    </button>
  </div>
</header>

<main style:padding-bottom={claude.open ? 'var(--drawer-space)' : undefined}>
  {#if route.page === 'now'}
    <Now />
  {:else if route.page === 'progress'}
    <Progress />
  {:else if route.page === 'map'}
    <KnowledgeMap />
  {:else if route.page === 'topics'}
    <Topics />
  {:else if route.page === 'topic'}
    {#key route.slug}<Topic slug={route.slug} concept={route.concept} />{/key}
  {:else if route.page === 'log'}
    <Log />
  {:else}
    {#key route.id}<SessionView id={route.id} />{/key}
  {/if}
</main>

{#if claude.mounted}
  <TerminalDrawer />
{/if}
