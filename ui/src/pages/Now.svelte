<script lang="ts">
  import { tick } from 'svelte';
  import { feed } from '../lib/feed.svelte.ts';
  import { link } from '../lib/router.svelte.ts';
  import FeedList from '../lib/FeedList.svelte';
  import MapGraph from '../lib/MapGraph.svelte';
  import StatusBar from '../lib/StatusBar.svelte';
  import type { ConceptStatus } from '../../../shared/types.ts';

  let mapOpen = $state(false);
  let count = 0;

  const topic = $derived(feed.currentTopic);
  const counts = $derived.by(() => {
    const c: Record<ConceptStatus, number> = { unknown: 0, shaky: 0, solid: 0 };
    for (const x of topic?.concepts ?? []) c[x.status]++;
    return c;
  });
  const focus = $derived(topic?.concepts.find((c) => c.id === topic.focus) ?? null);

  // Follow the lesson as it grows, unless the learner has scrolled back up to reread.
  $effect(() => {
    const n = feed.items.length;
    if (n <= count) {
      count = n;
      return;
    }
    const first = count === 0;
    count = n;
    const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 400;
    if (!first && !nearBottom && !feed.pending) return;
    void tick().then(() => {
      const target = feed.pending ? document.getElementById(`item-${feed.pending.id}`) : null;
      if (target) target.scrollIntoView({ behavior: first ? 'instant' : 'smooth', block: 'start' });
      else window.scrollTo({ top: document.body.scrollHeight, behavior: first ? 'instant' : 'smooth' });
    });
  });
</script>

<div class="now" class:has-map={topic}>
  <section class="feed-col">
    {#if feed.session}
      <header class="session-head">
        <div>
          <a class="eyebrow" href={link.topic(feed.session.topicSlug)}>{feed.session.topic}</a>
          <h1>{feed.session.goal}</h1>
        </div>
        {#if topic}
          <button class="map-toggle" onclick={() => (mapOpen = !mapOpen)} aria-expanded={mapOpen}>Map</button>
        {/if}
      </header>
    {/if}

    {#if feed.items.length === 0}
      <div class="empty">
        <h1>{feed.session ? 'Session started' : 'Nothing here yet'}</h1>
        <p>
          {#if feed.session}
            Claude is getting ready.
          {:else}
            Open Claude Code in <code>~/Projects/Learn</code> and say what you want to learn, or type <code>/teach</code>.
          {/if}
        </p>
      </div>
    {:else}
      <FeedList items={feed.items} pendingId={feed.pending?.id ?? null} />
      {#if feed.session?.endedAt}
        <p class="hint">Session ended. Start a new one from Claude Code whenever you like.</p>
      {:else if !feed.pending}
        <p class="hint">Questions and comments go to Claude in the terminal.</p>
      {/if}
    {/if}
  </section>

  {#if topic}
    <aside class="map-panel card" class:open={mapOpen}>
      <header>
        <a href={link.topic(topic.slug)}>{topic.title}</a>
        <button class="close" onclick={() => (mapOpen = false)} aria-label="Close map">×</button>
      </header>
      <StatusBar {counts} legend />
      <MapGraph {topic} direction="TB" fit onselect={(id) => (location.hash = link.topic(topic.slug, id))} />
      {#if focus}
        <p class="focus-line"><span class="label">Now</span> {focus.label}</p>
      {/if}
    </aside>
  {/if}
</div>
