<script lang="ts">
  // The live lesson: what Claude is showing and asking right now, with the composer and the lesson's bench.
  import { setContext, tick } from 'svelte';
  import { actions } from '../lib/actions.ts';
  import { claude } from '../lib/claude.svelte.ts';
  import { placeFigures } from '../lib/explorables/index.ts';
  import { feed } from '../lib/feed.svelte.ts';
  import { countsOf, placeOf } from '../lib/library.ts';
  import { link } from '../lib/router.svelte.ts';
  import Composer from '../lib/Composer.svelte';
  import FeedList from '../lib/FeedList.svelte';
  import Grip from '../lib/Grip.svelte';
  import Home from '../lib/Home.svelte';
  import LessonActivity from '../lib/LessonActivity.svelte';
  import LessonBench from '../lib/LessonBench.svelte';
  import ReviewPanel from '../lib/ReviewPanel.svelte';

  const KIND = { learn: 'Lesson', review: 'Review', train: 'Training set' } as const;

  let benchOpen = $state(false);
  let stopHint = $state(false);
  /** How many items the feed had last time we looked; plain, so reading it doesn't make the scroll effect depend on it. */
  let count = 0;

  const live = $derived(feed.liveSlug !== null);
  const topic = $derived(feed.currentTopic);
  const reviewing = $derived(feed.session?.kind === 'review');
  const place = $derived(topic ? placeOf(topic.slug, feed.roadmapList) : null);
  const counts = $derived(countsOf(topic ?? undefined));

  setContext('topic-slug', () => feed.session?.topicSlug);

  // When Claude starts working at the end of the lesson, keep its activity card in view if he is near the bottom.
  $effect(() => {
    if (!claude.busy && !feed.wrapping) return;
    const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 500;
    if (nearBottom && !feed.pending) void tick().then(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
  });

  // Follow the lesson as it grows, unless he has scrolled back up to reread.
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

  /** Asks Claude to wrap up; if Claude isn't running here, says where to tell it instead. */
  function stop() {
    if (!actions.stopForToday()) stopHint = true;
  }
</script>

{#if live && feed.session}
  <div class="lesson" class:with-bench={topic || reviewing}>
    <div class="lesson-main">
      <header class="lesson-head">
        <nav class="crumbs" aria-label="Where this is">
          {#if place}
            <a href={link.roadmap(place.roadmap.slug)}>{place.roadmap.title}</a>
            <span class="sep">/</span>
            <a href={link.topic(feed.session.topicSlug)}>{place.index + 1} · {feed.session.topic}</a>
          {:else if !reviewing}
            <a href={link.topic(feed.session.topicSlug)}>{feed.session.topic}</a>
          {:else}
            <span>Review</span>
          {/if}
        </nav>
        <div class="title-row">
          <h1 class="page-title">{reviewing ? 'Review' : feed.session.topic}</h1>
          <button
            class="ghost small stop"
            onclick={stop}
            disabled={feed.wrapping}
            title="Claude updates your map and writes where to pick up next time"
            >{feed.wrapping ? 'Wrapping up…' : 'Stop for today'}</button
          >
        </div>
        {#if stopHint && !claude.running}<p class="stop-hint muted">
            Claude isn't running in Aristotle. If you're talking to it in your own terminal, tell it there to stop for today.
          </p>{/if}
        <dl class="props">
          <dt>session</dt>
          <dd>{KIND[feed.session.kind ?? 'learn']}: {feed.session.goal}</dd>
          {#if place}<dt>roadmap</dt>
            <dd>
              <a href={link.roadmap(place.roadmap.slug)}>{place.roadmap.title}</a>, step {place.index + 1} of {place.roadmap.steps.length}
            </dd>{/if}
          {#if topic && counts.total}<dt>progress</dt>
            <dd>{counts.solid} of {counts.total} concepts solid</dd>{/if}
        </dl>
        {#if topic || reviewing}
          <button class="ghost small bench-toggle" onclick={() => (benchOpen = true)}
            >{reviewing ? 'The queue' : 'Outline and graph'}</button
          >
        {/if}
      </header>

      {#if feed.items.length === 0}
        <div class="lesson-wait">
          <span class="spinner" aria-hidden="true"></span>
          <p>Claude is getting the lesson ready. It usually starts with the big picture, then finds out what you already know.</p>
        </div>
      {:else}
        <FeedList items={feed.items} pendingId={feed.pending?.id ?? null} figures={placeFigures(feed.session.topicSlug, feed.items)} />
      {/if}
      <LessonActivity />
      <Composer />
    </div>

    {#if reviewing || topic}
      <aside class="bench" class:open={benchOpen} aria-label={reviewing ? 'Review queue' : 'Where this lesson sits'}>
        {#if reviewing}
          <div class="bench-inner"><ReviewPanel onclose={() => (benchOpen = false)} /></div>
        {:else if topic}
          <LessonBench {topic} onclose={() => (benchOpen = false)} />
        {/if}
        <Grip name="--side-w" side="left" min={220} max={480} initial={280} label="Resize the sidebar" />
      </aside>
    {/if}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="bench-scrim" class:open={benchOpen} onclick={() => (benchOpen = false)}></div>
  </div>
{:else}
  <Home />
{/if}

<style>
  .title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .stop {
    flex: none;
    margin-top: 6px;
  }

  .stop-hint {
    margin: 8px 0 0;
    font-size: 0.82rem;
  }
</style>
