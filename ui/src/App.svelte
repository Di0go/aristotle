<script lang="ts">
  import { feed } from './lib/feed.svelte.ts';
  import { link, router } from './lib/router.svelte.ts';
  import Now from './pages/Now.svelte';
  import Topics from './pages/Topics.svelte';
  import Topic from './pages/Topic.svelte';
  import Log from './pages/Log.svelte';
  import SessionView from './pages/SessionView.svelte';

  feed.start();

  const route = $derived(router.route);
  const section = $derived(
    route.page === 'topic' ? 'topics' : route.page === 'session' ? 'log' : route.page,
  );
</script>

<header class="topbar">
  <a class="brand" href={link.now()}><span class="mark" aria-hidden="true"></span>Mind Gym</a>
  <nav>
    <a href={link.now()} class:current={section === 'now'}>
      Now{#if feed.pending && section !== 'now'}<i class="badge" aria-label="waiting for you"></i>{/if}
    </a>
    <a href={link.topics()} class:current={section === 'topics'}>Topics</a>
    <a href={link.log()} class:current={section === 'log'}>Log</a>
  </nav>
  <div class="status">
    {#if !feed.connected}
      <span class="pill offline">Offline</span>
    {:else if feed.pending}
      <a class="pill your-turn" href={link.now()}>Your turn</a>
    {/if}
  </div>
</header>

<main>
  {#if route.page === 'now'}
    <Now />
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
