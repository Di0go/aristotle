<script lang="ts">
  // A class: its steps, in order, one line each with how its checks went, and where he picks it up. Each step is
  // a page of its own (Step.svelte). Nothing starts by coming here: Claude starts only when he writes in the box
  // at the foot or presses Continue, and when the lesson starts he is taken to the step being taught.
  import { actions } from '../lib/actions.ts';
  import { claude } from '../lib/claude.svelte.ts';
  import { classes } from '../lib/classes.svelte.ts';
  import { feed } from '../lib/feed.svelte.ts';
  import { countsOf, placeOf } from '../lib/library.ts';
  import { link } from '../lib/router.svelte.ts';
  import { pageLabel, stepMark } from '../lib/steps.ts';
  import Grip from '../lib/Grip.svelte';
  import LessonBench from '../lib/LessonBench.svelte';

  let { slug }: { slug: string } = $props();

  let text = $state('');
  let benchOpen = $state(false);

  const live = $derived(feed.liveSlug === slug);
  const topic = $derived(feed.topics[slug] ?? null);
  const place = $derived(placeOf(slug, feed.roadmapList));
  const step = $derived(place ? place.roadmap.steps[place.index] : null);
  const title = $derived(topic?.title ?? step?.title ?? slug);
  const counts = $derived(countsOf(topic ?? undefined));
  const started = $derived(Boolean(topic));
  const pages = $derived(started ? classes.pages(slug) : []);
  const steps = $derived(pages?.filter((p) => p.number > 0).length ?? 0);

  // A lesson he asked for on this class: once it is live, go to the step being taught.
  $effect(() => {
    if (feed.follow !== slug || !live || !pages?.length) return;
    feed.follow = null;
    location.hash = link.step(slug, pages.at(-1)!.number);
  });

  /** Interacting is what starts the class: his words go to Claude as the first thing it hears. */
  function begin(said = '') {
    if (started) actions.continueTopic(slug, said);
    else if (place) actions.startStep(place.roadmap, place.index, said);
    // Neither a topic nor a roadmap step (an old link, or a step since removed): start a lesson on it anyway.
    else actions.learn(title, said);
    text = '';
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      begin(text);
    }
  }
</script>

<div class="lesson" class:with-bench={topic}>
  <div class="lesson-main">
    <header class="lesson-head">
      <nav class="crumbs" aria-label="Where this is">
        {#if place}
          <a href={link.roadmap(place.roadmap.slug)}>{place.roadmap.title}</a>
          <span class="sep">/</span>
          <span>topic {place.index + 1} of {place.roadmap.steps.length}</span>
        {:else}
          <a href={link.roadmaps()}>Library</a>
        {/if}
      </nav>
      <h1 class="page-title">{title}</h1>
      <dl class="props">
        {#if topic?.goal || step?.goal}<dt>goal</dt>
          <dd>{topic?.goal ?? step?.goal}</dd>{/if}
        {#if counts.total}<dt>progress</dt>
          <dd>{counts.solid} of {counts.total} concepts solid</dd>{/if}
      </dl>
      {#if topic}<button class="ghost small bench-toggle" onclick={() => (benchOpen = true)}>Outline and graph</button>{/if}
    </header>

    {#if !started}
      <div class="not-begun">
        {#if step?.why}<p>{step.why}</p>{/if}
        <p class="muted">
          This class hasn't begun. When it does, it opens with the big picture, then finds out what you already know before teaching
          anything.
        </p>
      </div>
    {:else if pages === null}
      <p class="muted center">Loading the class…</p>
    {:else}
      <ol class="steps">
        {#each pages as p (p.number)}
          {@const m = stepMark(p)}
          <li>
            <a href={link.step(slug, p.number)} class:now={p.live && live && p === pages.at(-1)}>
              <span class="n">{p.number === 0 ? '' : p.number}</span>
              <span class="t">{p.title ?? (p.upcoming ? 'Warming up' : pageLabel(p))}</span>
              {#if p.live && live && p === pages.at(-1)}<span class="m now-tag">now</span>
              {:else if m.text}<span class="m {m.tone}" title={m.title}>{m.text}</span>{/if}
            </a>
          </li>
        {/each}
      </ol>
    {/if}

    {#if live}
      <div class="composer resume">
        <a class="primary" href={link.step(slug, pages?.at(-1)?.number ?? 0)}>Go to the lesson</a>
      </div>
    {:else}
      <!-- Where he starts or picks it up -->
      <div class="composer resume">
        <p class="resume-h">{started ? 'Pick up the class' : 'Begin the class'}</p>
        {#if topic?.handoff}<p class="resume-next"><span class="muted">Where you are:</span> {topic.handoff.next}</p>{/if}
        <div class="composer-row">
          <textarea
            bind:value={text}
            onkeydown={onKey}
            rows="1"
            placeholder={started ? 'Ask about anything in the class, or just say “go”…' : 'Say what you want from it, or just “go”…'}
            aria-label="Your first words to Claude"></textarea>
          <button class="primary" onclick={() => begin(text)}>{started ? 'Continue' : 'Start'}</button>
        </div>
        {#if feed.starting}
          <p class="composer-off picking-up"><span class="spinner" aria-hidden="true"></span>Claude is picking up the class…</p>
        {:else}
          <p class="composer-off">{claude.running ? 'Claude picks it up from here.' : 'This starts Claude here in Aristotle.'}</p>
        {/if}
      </div>
    {/if}
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

  .steps {
    max-width: var(--measure);
    margin: 0 auto 8px;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--rule);
  }

  .steps a {
    display: flex;
    align-items: baseline;
    gap: 14px;
    padding: 12px 4px;
    border-bottom: 1px solid var(--rule);
    color: var(--fg);
    text-decoration: none;
    transition: background-color 0.12s;
  }

  .steps a:hover {
    background: var(--hover);
  }

  .steps .n {
    flex: none;
    width: 1.6em;
    text-align: right;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }

  .steps .t {
    flex: 1;
    font-weight: 500;
  }

  .steps .m {
    flex: none;
    font-size: 0.8rem;
    color: var(--faint);
  }

  .steps .m.done {
    color: var(--solid);
  }

  .steps .m.mixed {
    color: var(--shaky);
  }

  .steps .m.todo,
  .steps .now-tag {
    color: var(--acc);
  }

  .steps a.now .t {
    color: var(--acc);
  }

  .picking-up {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .picking-up .spinner {
    width: 12px;
    height: 12px;
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
