<script lang="ts">
  // Review (#/review) and training sets (#/train/<slug>): sittings that belong to no lesson, each in its own place.
  // With one open, it is shown as it grows, with the composer and its bench (the review queue, or the class); with
  // none, what there is to do and one button to begin. Leaving is pausing: nothing has to be stopped, answers are
  // kept, and a question left waiting is still here to answer later, which picks the sitting up again.
  import { setContext, tick } from 'svelte';
  import { actions } from '../lib/actions.ts';
  import { bench } from '../lib/bench.svelte.ts';
  import { claude } from '../lib/claude.svelte.ts';
  import { placeFigures } from '../lib/explorables/index.ts';
  import { feed, refetching } from '../lib/feed.svelte.ts';
  import { ago, onDay } from '../lib/format.ts';
  import { countsOf } from '../lib/library.ts';
  import { link } from '../lib/router.svelte.ts';
  import Composer from '../lib/Composer.svelte';
  import FeedList from '../lib/FeedList.svelte';
  import Grip from '../lib/Grip.svelte';
  import LessonActivity from '../lib/LessonActivity.svelte';
  import LessonBench from '../lib/LessonBench.svelte';
  import ReviewPanel from '../lib/ReviewPanel.svelte';
  import type { ReviewQueue } from '../../../shared/types.ts';

  let { kind, slug = '' }: { kind: 'review' | 'train'; slug?: string } = $props();

  let benchOpen = $state(false);
  /** How many items the feed had last time we looked; plain, so reading it doesn't make the scroll effect depend on it. */
  let count = 0;
  /** A clock, so a sitting left alone is seen as left (feed.svelte.ts inProgressAt). */
  let now = $state(Date.now());
  let queue = $state<ReviewQueue | null>(null);

  const reviewing = $derived(kind === 'review');
  /** This page's sitting: the open review, or the open training set on this class. */
  const mine = $derived(
    feed.session && !feed.session.endedAt && feed.session.kind === kind && (reviewing || feed.session.topicSlug === slug)
      ? feed.session
      : null,
  );
  /** Something happened in it lately (rather than left open since another day). */
  const going = $derived(Boolean(mine) && feed.inProgressAt(now));
  const topic = $derived(reviewing ? null : (feed.topics[slug] ?? null));
  const counts = $derived(countsOf(topic ?? undefined));
  const title = $derived(reviewing ? 'Review' : `Training: ${topic?.title ?? slug}`);

  setContext('topic-slug', () => feed.session?.topicSlug);

  refetching(
    async () => (await (await fetch('/api/reviews')).json()) as ReviewQueue,
    (q) => (queue = q),
  );

  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });

  function begin() {
    if (reviewing) actions.review();
    else actions.train(slug);
  }

  // Follow the sitting as it grows, unless he has scrolled back up to reread.
  $effect(() => {
    const n = mine ? feed.items.length : 0;
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

  // When Claude starts working at the end of the sitting, keep its activity card in view if he is near the bottom.
  $effect(() => {
    if (!mine || !claude.busy) return;
    const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 500;
    if (nearBottom && !feed.pending) void tick().then(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
  });
</script>

{#if mine}
  <div class="lesson" class:with-bench={!bench.hidden}>
    <div class="lesson-main">
      <header class="lesson-head">
        <nav class="crumbs" aria-label="Where this is">
          {#if reviewing}<span>Review</span>{:else}<a href={link.lesson(slug)}>{topic?.title ?? slug}</a><span class="sep">/</span><span
              >Training</span
            >{/if}
        </nav>
        <div class="title-row">
          <h1 class="page-title">{title}</h1>
          {#if bench.hidden}
            <button class="ghost small" onclick={() => bench.toggle(false)}>{reviewing ? 'Show the queue' : 'Show the class'}</button>
          {:else}
            <button class="ghost small bench-toggle" onclick={() => (benchOpen = true)}>{reviewing ? 'The queue' : 'The class'}</button>
          {/if}
        </div>
        <p class="page-lede">
          {#if going}
            {mine.goal}. Leave whenever you like: your answers are kept, and it waits here for you.
          {:else if feed.pending}
            You left this {ago(feed.lastActivity ? new Date(feed.lastActivity).toISOString() : mine.startedAt)}. Answer the question below
            whenever you like: it picks the {reviewing ? 'review' : 'training set'} up again.
          {:else}
            You left this {ago(feed.lastActivity ? new Date(feed.lastActivity).toISOString() : mine.startedAt)}.
            <button class="primary small" onclick={begin}>Pick it up again</button>
          {/if}
        </p>
      </header>

      {#if feed.items.length === 0}
        <div class="lesson-wait">
          <span class="spinner" aria-hidden="true"></span>
          <p>Claude is getting it ready: it reads what is due and picks where to start.</p>
        </div>
      {:else}
        <FeedList items={feed.items} pendingId={feed.pending?.id ?? null} figures={placeFigures(mine.topicSlug, feed.items)} />
      {/if}
      <LessonActivity />
      <Composer />
    </div>

    {#if !bench.hidden}
      <aside class="bench" class:open={benchOpen} aria-label={reviewing ? 'Review queue' : 'The class'}>
        {#if reviewing}
          <div class="bench-inner"><ReviewPanel onclose={() => (benchOpen = false)} /></div>
        {:else if topic}
          <LessonBench {topic} onclose={() => (benchOpen = false)} />
        {/if}
        <Grip name="--side-w" side="left" min={240} max={600} initial={340} label="Resize the sidebar" />
      </aside>
    {/if}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="bench-scrim" class:open={benchOpen} onclick={() => (benchOpen = false)}></div>
  </div>
{:else}
  <div class="page practice">
    <header class="page-head">
      {#if !reviewing}<nav class="crumbs" aria-label="Where this is"><a href={link.lesson(slug)}>{topic?.title ?? slug}</a></nav>{/if}
      <h1 class="page-title">{title}</h1>
      <p class="page-lede">
        {#if reviewing}
          Recall what you hold just as it starts to fade: that is what makes it last. A few questions you answer in your own words; stop
          whenever you like.
        {:else}
          Problems just above what you hold solidly, to solve without help; they get harder as you solve them cleanly. Stop whenever you
          like.
        {/if}
      </p>
    </header>

    {#if reviewing}
      {#if queue}
        <section class="sheet start">
          {#if queue.fading.length}
            <p class="start-line">
              <strong>{queue.fading.length} {queue.fading.length === 1 ? 'concept is' : 'concepts are'} fading.</strong>
              {#if queue.upcoming}{queue.upcoming} more come due in the next 7 days.{/if}
            </p>
            <button class="primary" onclick={begin}>Start a review</button>
          {:else}
            <p class="start-line">
              <strong>Nothing is fading.</strong>
              {queue.upcoming ? `${queue.upcoming} come due in the next 7 days.` : 'Concepts come here once they are solid.'}
            </p>
          {/if}
        </section>
        {#if queue.fading.length}
          <section>
            <h2 class="section-title">Fading</h2>
            <ul class="due">
              {#each queue.fading as f (`${f.topic}/${f.id}`)}
                <li>
                  <a href={link.topic(f.topic, f.id)}><i class="dot fading"></i>{f.label}</a>
                  <span class="muted">{f.topicTitle} · recall about {Math.round(f.recall * 100)}% · due {onDay(f.due)}</span>
                </li>
              {/each}
            </ul>
          </section>
        {/if}
      {:else}
        <p class="muted">Loading…</p>
      {/if}
    {:else if topic}
      <section class="sheet start">
        <p class="start-line">
          <strong>{counts.solid} of {counts.total} concepts solid</strong>{topic.training
            ? `, training level ${topic.training.level}/10`
            : ''}.
        </p>
        <button class="primary" onclick={begin}>Start a training set</button>
      </section>
    {:else}
      <p class="muted">No such class.</p>
    {/if}
  </div>
{/if}

<style>
  .title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .start {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin: 8px 0 32px;
    padding: 18px 20px;
  }

  .start-line {
    margin: 0;
    color: var(--muted);
  }

  .start-line strong {
    color: var(--fg);
  }

  .due {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .due li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }

  .due a {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .due .muted {
    font-size: 0.84rem;
  }
</style>
