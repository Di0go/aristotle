<script lang="ts">
  import { tick } from 'svelte';
  import { feed } from '../lib/feed.svelte.ts';
  import { link } from '../lib/router.svelte.ts';
  import FeedList from '../lib/FeedList.svelte';
  import MapGraph from '../lib/MapGraph.svelte';
  import StatusBar from '../lib/StatusBar.svelte';
  import ReviewPanel from '../lib/ReviewPanel.svelte';
  import Composer from '../lib/Composer.svelte';
  import { isFading, type ConceptStatus } from '../../../shared/types.ts';

  let mapOpen = $state(false);
  let count = 0;

  const topic = $derived(feed.currentTopic);
  const reviewing = $derived(feed.session?.kind === 'review');
  const hasPanel = $derived(Boolean(topic) || reviewing);
  const fading = $derived(topic?.concepts.filter((c) => isFading(c)).length ?? 0);
  const KIND_LABEL = { learn: '', review: 'Review', train: 'Training' } as const;
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

<div class="now" class:has-map={hasPanel}>
  <section class="feed-col">
    {#if feed.session}
      <header class="session-head">
        <div>
          {#if reviewing}
            <a class="eyebrow" href={link.progress()}>Review</a>
          {:else}
            <a class="eyebrow" href={link.topic(feed.session.topicSlug)}>
              {KIND_LABEL[feed.session.kind ?? 'learn'] ? `${KIND_LABEL[feed.session.kind ?? 'learn']} · ` : ''}{feed.session.topic}
            </a>
          {/if}
          <h1>{feed.session.goal}</h1>
        </div>
        {#if hasPanel}
          <button class="map-toggle" onclick={() => (mapOpen = !mapOpen)} aria-expanded={mapOpen}>{reviewing ? 'Queue' : 'Map'}</button>
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
            Tell Claude what you want to learn: <code>/teach</code> and a topic, <code>/review</code>, or <code>/train</code>.
            Use the box below, or Claude Code in <code>~/Projects/Learn</code>.
          {/if}
        </p>
      </div>
    {:else}
      <FeedList items={feed.items} pendingId={feed.pending?.id ?? null} />
      {#if feed.session?.endedAt}
        <p class="hint">Session ended. Start a new one whenever you like.</p>
      {/if}
    {/if}
    <Composer />
  </section>

  {#if reviewing}
    <aside class="map-panel card" class:open={mapOpen}>
      <ReviewPanel onclose={() => (mapOpen = false)} />
    </aside>
  {:else if topic}
    <aside class="map-panel card" class:open={mapOpen}>
      <header>
        <a href={link.topic(topic.slug)}>{topic.title}</a>
        <button class="close" onclick={() => (mapOpen = false)} aria-label="Close map">×</button>
      </header>
      <StatusBar {counts} {fading} legend />
      <MapGraph {topic} others={feed.topics} direction="TB" fit onselect={(id) => (location.hash = link.topic(topic.slug, id))} />
      {#if focus}
        <p class="focus-line"><span class="label">Now</span> {focus.label}</p>
      {/if}
    </aside>
  {/if}
</div>
