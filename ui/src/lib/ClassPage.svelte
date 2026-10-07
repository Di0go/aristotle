<script lang="ts">
  // One page of a class: the intro, or one step with its checks and the feedback on his answers, with Previous
  // and Next. The step being taught now is the same page, live: it grows as Claude adds to it, carries the
  // composer, and moves on to the next step when Claude starts it, if he was on it.
  import { setContext, tick } from 'svelte';
  import { actions } from './actions.ts';
  import { asides } from './aside.svelte.ts';
  import { claude } from './claude.svelte.ts';
  import { classes } from './classes.svelte.ts';
  import { placeFigures } from './explorables/index.ts';
  import { bench } from './bench.svelte.ts';
  import { feed } from './feed.svelte.ts';
  import { focus } from './focus.svelte.ts';
  import { placeOf } from './library.ts';
  import { renderMarkdown } from './markdown.ts';
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
  /** Items on this page last time we looked; plain, so reading it doesn't make the scroll effect depend on it. */
  let count = 0;
  /** How many pages the class had last time we looked, to tell a new step arriving from him moving between steps. */
  let seen = 0;

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
  /** The questions he asked on passages of this page, oldest first. */
  const questions = $derived.by(() => {
    const ids = new Set([...(page?.warmup ?? []), ...(page?.items ?? [])].map((i) => i.id));
    return feed.asides.filter((a) => a.item && ids.has(a.item));
  });

  setContext('topic-slug', () => slug);

  // When the live class gains a page while he is on what was its last one, take him to the new one. Moving to an
  // earlier step himself changes no count, so it never pulls him back.
  $effect(() => {
    if (!pages) return;
    const before = seen;
    seen = pages.length;
    if (before && pages.length > before && feed.liveSlug === slug && pages[before - 1]?.number === number) {
      location.hash = link.step(slug, pages.at(-1)!.number);
    }
  });

  // The page stays mounted from step to step: another step starts as if opened afresh, with the panel closed (on a
  // narrow screen) and the live page followed from its start.
  let shown: number | null = null;
  $effect.pre(() => {
    if (number === shown) return;
    shown = number;
    benchOpen = false;
    count = 0;
  });

  // On the live page, follow it as it grows, unless he has scrolled back up to reread.
  $effect(() => {
    void number;
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

  /** A page as a link label: "Step 2 · The heart beats by itself". */
  function name(p: ClassPage): string {
    return p.title ? `${pageLabel(p)} · ${p.title}` : pageLabel(p);
  }
</script>

<div class="lesson" class:with-bench={topic && !bench.hidden}>
  <div class="lesson-main">
    <header class="page-head-row">
      <nav class="crumbs" aria-label="Where this is">
        {#if place}<a href={link.roadmap(place.roadmap.slug)}>{place.roadmap.title}</a><span class="sep">/</span>{/if}
        <a href={link.lesson(slug)}>{title}</a>
        {#if page}<span class="sep">/</span><span>{pageLabel(page)}{page.number ? ` of ${steps}` : ''}</span>{/if}
      </nav>
      <div class="head-tools">
        {#if !focus.on}<button class="ghost small" onclick={() => focus.toggle(true)} title="Hide everything but this step (F)"
            >Focus</button
          >{/if}
        {#if topic && bench.hidden}<button class="ghost small" onclick={() => bench.toggle(false)} title="Show the panel beside the step"
            >« Panel</button
          >{/if}
        {#if topic && !bench.hidden}<button class="ghost small bench-toggle" onclick={() => (benchOpen = true)}>About this step</button
          >{/if}
      </div>
    </header>

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

      {#if questions.length}
        <section class="questions" aria-label="Your questions on this step">
          <p class="kicker">Your questions</p>
          {#each questions as a (a.id)}
            <article class="q">
              <p class="q-q">{a.question}</p>
              <p class="q-p">“{a.passage}”</p>
              <div class="q-a md-box">{@html renderMarkdown(a.answer)}</div>
              <button class="link q-x" onclick={() => void asides.remove(a.id)}>Remove</button>
            </article>
          {/each}
        </section>
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

  {#if topic && !bench.hidden}
    <aside class="bench" class:open={benchOpen} aria-label="About this step">
      <LessonBench {topic} {page} onclose={() => (benchOpen = false)} />
      <Grip name="--side-w" side="left" min={240} max={600} initial={340} label="Resize the sidebar" />
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

  .questions {
    display: grid;
    gap: 12px;
    max-width: var(--measure);
    margin: 32px auto 0;
  }

  .questions .kicker {
    margin: 0;
  }

  .q {
    position: relative;
    padding: 14px 16px;
    background: var(--b1);
    border-radius: var(--radius-lg);
    font-size: 0.92rem;
    line-height: 1.6;
  }

  .q-q {
    margin: 0 4.5rem 4px 0;
    font-weight: 600;
    color: var(--fg);
  }

  .q-p {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    margin: 0 0 8px;
    padding-left: 10px;
    border-left: 2px solid var(--acc-line);
    font-size: 0.82rem;
    color: var(--muted);
  }

  .q-a {
    color: var(--fg-2);
  }

  .q-a :global(p) {
    margin: 0 0 8px;
  }

  .q-a :global(p:last-child) {
    margin: 0;
  }

  .q-x {
    position: absolute;
    top: 14px;
    right: 16px;
    font-size: 0.78rem;
    color: var(--faint);
  }

  .q-x:hover {
    color: var(--wrong);
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
