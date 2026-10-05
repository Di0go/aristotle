<script lang="ts">
  // One page of a class: the intro, or one step with its checks and the feedback on his answers, with Previous
  // and Next. The step being taught now is the same page, live: it grows as Claude adds to it, carries the
  // composer, and moves on to the next step when Claude starts it, if he was on it.
  import { setContext, tick } from 'svelte';
  import { actions } from './actions.ts';
  import { claude } from './claude.svelte.ts';
  import { classes } from './classes.svelte.ts';
  import { placeFigures } from './explorables/index.ts';
  import { feed } from './feed.svelte.ts';
  import { placeOf } from './library.ts';
  import { link } from './router.svelte.ts';
  import { pageLabel, type ClassPage } from './steps.ts';
  import Composer from './Composer.svelte';
  import FeedList from './FeedList.svelte';
  import Grip from './Grip.svelte';
  import LessonActivity from './LessonActivity.svelte';
  import LessonBench from './LessonBench.svelte';

  /** 0 is the intro, then each step. */
  let { slug, number }: { slug: string; number: number } = $props();

  let benchOpen = $state(false);
  let stopHint = $state(false);
  /** Items on this page last time we looked; plain, so reading it doesn't make the scroll effect depend on it. */
  let count = 0;
  /** Whether he was on the last page, so a new step can take him along. */
  let wasLast = false;

  const pages = $derived(classes.pages(slug));
  const index = $derived(pages ? pages.findIndex((p) => p.number === number) : -1);
  const page = $derived<ClassPage | null>(pages?.[index] ?? null);
  const prev = $derived(pages && index > 0 ? pages[index - 1] : null);
  const next = $derived(pages && index >= 0 && index < pages.length - 1 ? pages[index + 1] : null);
  const last = $derived(Boolean(pages && index === pages.length - 1));
  /** The page Claude is working on right now. */
  const live = $derived(Boolean(page?.live && last && feed.liveSlug === slug));
  const topic = $derived(feed.topics[slug] ?? null);
  const place = $derived(placeOf(slug, feed.roadmapList));
  const title = $derived(topic?.title ?? slug);
  const figures = $derived(
    placeFigures(
      slug,
      (pages ?? []).flatMap((p) => [...p.warmup, ...p.items] as { id: string; type: string }[]),
    ),
  );
  const steps = $derived(pages?.filter((p) => p.number > 0).length ?? 0);

  setContext('topic-slug', () => slug);

  // On the last page of a live class, a new step takes him to it.
  $effect(() => {
    if (!pages) return;
    if (wasLast && !last && feed.liveSlug === slug) location.hash = link.step(slug, pages.at(-1)!.number);
    wasLast = last;
  });

  // On the live page, follow it as it grows, unless he has scrolled back up to reread.
  $effect(() => {
    const n = page ? page.warmup.length + page.items.length : 0;
    if (!live || n <= count) {
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

  /** A page as a link label: "Step 2 · The heart beats by itself". */
  function name(p: ClassPage): string {
    return p.title ? `${pageLabel(p)} · ${p.title}` : pageLabel(p);
  }
</script>

<div class="lesson" class:with-bench={topic}>
  <div class="lesson-main">
    <header class="page-head-row">
      <nav class="crumbs" aria-label="Where this is">
        {#if place}<a href={link.roadmap(place.roadmap.slug)}>{place.roadmap.title}</a><span class="sep">/</span>{/if}
        <a href={link.lesson(slug)}>{title}</a>
        {#if page}<span class="sep">/</span><span>{pageLabel(page)}{page.number ? ` of ${steps}` : ''}</span>{/if}
      </nav>
      <div class="head-tools">
        {#if live}
          <button
            class="ghost small"
            onclick={stop}
            disabled={feed.wrapping}
            title="Claude updates your map and writes where to pick up next time"
            >{feed.wrapping ? 'Wrapping up…' : 'Stop for today'}</button
          >
        {/if}
        {#if topic}<button class="ghost small bench-toggle" onclick={() => (benchOpen = true)}>Outline and graph</button>{/if}
      </div>
    </header>
    {#if stopHint && !claude.running}<p class="stop-hint muted">
        Claude isn't running in Aristotle. If you're talking to it in your own terminal, tell it there to stop for today.
      </p>{/if}

    {#if pages === null}
      <p class="muted center">Loading the class…</p>
    {:else if !page}
      <div class="empty-state">
        <p>There is no {number === 0 ? 'intro' : `step ${number}`} in this class yet.</p>
        <p><a href={link.lesson(slug)}>See the whole class</a></p>
      </div>
    {:else}
      {#if page.number === 0}<p class="kicker intro-k">Intro: the big picture, what you already knew, and the plan</p>{/if}
      {#if page.warmup.length}
        <p class="kicker warmup-k">Warm-up: back over earlier steps before step {page.number}</p>
        <FeedList items={page.warmup} pendingId={live ? (feed.pending?.id ?? null) : null} readonly={!live} {figures} />
      {/if}
      {#if page.upcoming}
        <p class="muted center">Step {page.number} comes next, once the warm-up is done.</p>
      {:else}
        <FeedList
          items={page.items}
          pendingId={live ? (feed.pending?.id ?? null) : null}
          readonly={!live}
          {figures}
          firstStep={page.number}
        />
      {/if}

      {#if live}
        <LessonActivity />
        <Composer />
      {/if}

      <nav class="step-nav" aria-label="Steps">
        {#if prev}<a class="prev" href={link.step(slug, prev.number)}><span class="dir">Previous</span>{name(prev)}</a>{:else}<span
          ></span>{/if}
        {#if next}<a class="next" href={link.step(slug, next.number)}><span class="dir">Next</span>{name(next)}</a>
        {:else if !live}
          <button class="primary next-continue" onclick={() => actions.continueTopic(slug)}
            >{feed.starting ? 'Claude is picking up the class…' : 'Continue the class'}</button
          >
        {/if}
      </nav>
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
  .page-head-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    max-width: var(--measure);
    margin: 0 auto 28px;
  }

  .page-head-row .crumbs {
    margin: 0;
  }

  .head-tools {
    display: flex;
    gap: 8px;
    flex: none;
  }

  .stop-hint {
    max-width: var(--measure);
    margin: -16px auto 20px;
    font-size: 0.82rem;
  }

  .center {
    max-width: var(--measure);
    margin: 0 auto;
  }

  .intro-k,
  .warmup-k {
    max-width: var(--measure);
    margin: 0 auto 12px;
  }

  .warmup-k {
    color: var(--muted);
  }

  .step-nav {
    display: flex;
    justify-content: space-between;
    align-items: stretch;
    gap: 16px;
    max-width: var(--measure);
    margin: 48px auto 64px;
    padding-top: 20px;
    border-top: 1px solid var(--rule);
  }

  .step-nav a {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-width: 48%;
    padding: 10px 14px;
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    color: var(--fg);
    text-decoration: none;
    line-height: 1.4;
    transition: border-color 0.15s;
  }

  .step-nav a:hover {
    border-color: var(--acc-line);
  }

  .step-nav .next {
    margin-left: auto;
    text-align: right;
  }

  .dir {
    font-size: 0.75rem;
    color: var(--faint);
  }

  .next-continue {
    margin-left: auto;
    align-self: center;
  }
</style>
