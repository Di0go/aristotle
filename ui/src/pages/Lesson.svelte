<script lang="ts">
  import { placeFigures } from '../lib/explorables/index.ts';
  // The class for one topic, open to read: every step, figure and answer from all its sessions, in order.
  // Nothing starts by going here. Claude starts only when he interacts: writes in the box at the foot, or
  // presses Continue. If a lesson on this topic is running right now, this is that live lesson.
  import { setContext } from 'svelte';
  import { feed } from '../lib/feed.svelte.ts';
  import { link } from '../lib/router.svelte.ts';
  import { actions } from '../lib/actions.ts';
  import { claude } from '../lib/claude.svelte.ts';
  import { countsOf, placeOf } from '../lib/library.ts';
  import { formatDay, formatTime } from '../lib/format.ts';
  import FeedList from '../lib/FeedList.svelte';
  import LessonBench from '../lib/LessonBench.svelte';
  import Grip from '../lib/Grip.svelte';
  import Now from './Now.svelte';
  import type { PublicItem, Session, SessionSummary } from '../../../shared/types.ts';

  let { slug }: { slug: string } = $props();

  setContext('topic-slug', () => slug);

  let sessions = $state<{ session: Session; items: PublicItem[] }[] | null>(null);
  let text = $state('');
  let benchOpen = $state(false);

  const live = $derived(Boolean(feed.session && !feed.session.endedAt && feed.session.topicSlug === slug));
  const topic = $derived(feed.topics[slug] ?? null);
  const place = $derived(placeOf(slug, feed.roadmapList));
  const step = $derived(place ? place.roadmap.steps[place.index] : null);
  const title = $derived(topic?.title ?? step?.title ?? slug);
  const counts = $derived(countsOf(topic ?? undefined));
  const started = $derived(Boolean(topic));

  // Every session on this topic, oldest first.
  $effect(() => {
    void feed.topicVersion;
    if (live) return;
    void (async () => {
      const all = ((await (await fetch('/api/sessions')).json()) as SessionSummary[]).filter((s) => s.topicSlug === slug).reverse();
      const records = await Promise.all(
        all.map(async (s) => (await (await fetch(`/api/sessions/${encodeURIComponent(s.id)}`)).json()) as { session: Session; items: PublicItem[] }),
      );
      sessions = records.filter((r) => r.session);
    })();
  });

  /** Each figure placed once, after the first step (in any session) on a concept it explains. */
  const figures = $derived(placeFigures(slug, (sessions ?? []).flatMap((s) => s.items as { id: string; type: string }[])));

  /** Interacting is what starts the class: his words go to Claude as the first thing it hears. */
  function begin(said = '') {
    if (started) actions.continueTopic(slug, said);
    else if (place) actions.startStep(place.roadmap, place.index, said);
    text = '';
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      begin(text);
    }
  }
</script>

{#if live}
  <Now />
{:else}
  <div class="lesson" class:with-bench={topic}>
    <div class="lesson-main">
      <header class="lesson-head">
        <nav class="crumbs" aria-label="Where this is">
          {#if place}
            <a href={link.roadmap(place.roadmap.slug)}>{place.roadmap.title}</a>
            <span class="sep">/</span>
            <span>Step {place.index + 1} of {place.roadmap.steps.length}</span>
          {:else}
            <a href={link.roadmaps()}>Library</a>
          {/if}
        </nav>
        <h1 class="page-title">{title}</h1>
        <dl class="props">
          <dt>class</dt><dd>{started ? `${sessions?.length ?? '…'} ${sessions?.length === 1 ? 'session' : 'sessions'} so far. Reading it starts nothing.` : 'Not started yet.'}</dd>
          {#if topic?.goal || step?.goal}<dt>goal</dt><dd>{topic?.goal ?? step?.goal}</dd>{/if}
          {#if counts.total}<dt>progress</dt><dd>{counts.solid} of {counts.total} concepts solid</dd>{/if}
        </dl>
        {#if topic}<button class="ghost small bench-toggle" onclick={() => (benchOpen = true)}>Outline and graph</button>{/if}
      </header>

      {#if !started}
        <div class="not-begun">
          {#if step?.why}<p>{step.why}</p>{/if}
          <p class="muted">This class hasn't begun. When it does, it opens with the big picture, then finds out what you already know before teaching anything.</p>
        </div>
      {:else if sessions === null}
        <p class="muted center">Loading the class…</p>
      {:else}
        {#each sessions as s, i (s.session.id)}
          <div class="session-divider">
            <span>Session {i + 1}</span>
            <span class="muted">{formatDay(s.session.startedAt)}, {formatTime(s.session.startedAt)}{s.session.kind === 'train' ? ' · training' : s.session.kind === 'review' ? ' · review' : ''}</span>
          </div>
          <FeedList items={s.items} readonly figures={figures} />
        {/each}
      {/if}

      <div class="composer resume">
        <p class="resume-h">{started ? 'Pick up the class' : 'Begin the class'}</p>
        {#if topic?.handoff}<p class="resume-next"><span class="muted">Next time:</span> {topic.handoff.next}</p>{/if}
        <div class="composer-row">
          <textarea
            bind:value={text}
            onkeydown={onKey}
            rows="1"
            placeholder={started ? 'Ask about anything above, or just say “go”…' : 'Say what you want from it, or just “go”…'}
            aria-label="Your first words to Claude"
          ></textarea>
          <button class="primary" onclick={() => begin(text)}>{started ? 'Continue' : 'Start'}</button>
        </div>
        <p class="composer-off">{claude.running ? 'Claude picks it up from here.' : 'This starts Claude here in Aristotle.'}</p>
      </div>
    </div>

    {#if topic}
      <aside class="bench" class:open={benchOpen} aria-label="Where this class sits">
        <LessonBench {topic} onclose={() => (benchOpen = false)} />
        <Grip name="--side-w" side="left" min={220} max={480} initial={280} label="Resize the sidebar" />
      </aside>
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="bench-scrim" class:open={benchOpen} onclick={() => (benchOpen = false)}></div>
    {/if}
  </div>
{/if}

<style>
  .not-begun {
    max-width: var(--measure);
    margin: 0 auto 32px;
    line-height: 1.65;
  }

  .center {
    max-width: var(--measure);
    margin: 0 auto;
  }

  .session-divider {
    display: flex;
    align-items: baseline;
    gap: 10px;
    max-width: var(--measure);
    margin: 0 auto 28px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--rule);
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--fg-2);
  }

  .session-divider .muted {
    font-weight: 400;
  }

  /* On a class you are reading, the box waits at the end instead of following you down the page. */
  .resume {
    position: static;
    margin-top: 24px;
    padding: 28px 0 64px;
    background: none;
    border-top: 1px solid var(--rule);
  }

  .resume-h {
    margin: 0 0 8px;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--fg-2);
  }

  .resume-next {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    margin: 0 0 10px;
    font-size: 0.86rem;
    line-height: 1.55;
    color: var(--fg-2);
  }

  .resume .composer-off {
    margin-top: 6px;
  }
</style>
