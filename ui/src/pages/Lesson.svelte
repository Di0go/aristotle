<script lang="ts">
  // A class: where he is, with the one thing to do next; its steps, one line each with how its checks went; and
  // beside them what it teaches (its concepts), with the other ways to work on it. Each step is a page of its own
  // (Step.svelte). Nothing starts by coming here: Claude starts only when he presses Continue or writes in the box,
  // and when the lesson starts he is taken to the step being taught.
  import { actions } from '../lib/actions.ts';
  import { tutor } from '../lib/tutor.svelte.ts';
  import { classes } from '../lib/classes.svelte.ts';
  import { feed } from '../lib/feed.svelte.ts';
  import { ago } from '../lib/format.ts';
  import { countsOf, markOf, outline, placeOf } from '../lib/library.ts';
  import { link } from '../lib/router.svelte.ts';
  import { pageLabel, stepMark, type ClassPage } from '../lib/steps.ts';
  import StatusBar from '../lib/StatusBar.svelte';

  let { slug }: { slug: string } = $props();

  let text = $state('');

  const live = $derived(feed.liveSlug === slug);
  const topic = $derived(feed.topics[slug] ?? null);
  const place = $derived(placeOf(slug, feed.roadmapList));
  const step = $derived(place ? place.roadmap.steps[place.index] : null);
  const title = $derived(topic?.title ?? step?.title ?? slug);
  const counts = $derived(countsOf(topic ?? undefined));
  const started = $derived(Boolean(topic));
  const pages = $derived(started ? classes.pages(slug) : []);
  const concepts = $derived(topic ? outline(topic) : []);
  /** His missions on this class, not the dropped ones. */
  const missions = $derived(feed.missionList.filter((m) => m.topic === slug && m.scope !== 'capstone' && m.status !== 'dropped'));
  /** Where he is, said from the class itself (never from the tutor's notes), with the one thing to do about it. */
  const where = $derived.by((): { text: string; page?: ClassPage; action: string } | null => {
    if (!pages?.length) return null;
    const last = pages.at(-1)!;
    if (live) {
      const waiting = feed.pending ? ' A question is waiting for you.' : '';
      return {
        text: `${name(last)}, being taught now.${waiting}`,
        page: last,
        action: feed.pending ? 'Answer it' : `Open ${pageLabel(last).toLowerCase()}`,
      };
    }
    const open = pages.find((p) => p.checks.unanswered > 0);
    if (open) return { text: `${name(open)} has a question waiting for you.`, page: open, action: 'Answer it' };
    return { text: `Last: ${name(last)}, studied ${ago(topic!.updated)}.`, action: 'Continue' };
  });

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
    // Neither a topic nor a course's class (an old link, or one since removed): start a lesson on it anyway.
    else actions.learn(title, said);
    text = '';
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      begin(text);
    }
  }

  /** "Step 2 · The heart beats by itself". */
  function name(p: ClassPage): string {
    return p.title ? `${pageLabel(p)} · ${p.title}` : pageLabel(p);
  }

  /** A mission for this class: its course's mission when it is in one, a class mission otherwise. */
  function getMission() {
    if (place) actions.stepMission(place.roadmap, place.index);
    else actions.topicMission(slug);
  }
</script>

<div class="page class-page">
  <header class="page-head">
    <nav class="crumbs" aria-label="Where this is">
      {#if place}
        <a href={link.roadmap(place.roadmap.slug)}>{place.roadmap.title}</a>
        <span class="sep">/</span>
        <span>class {place.index + 1} of {place.roadmap.steps.length}</span>
      {:else}
        <a href={link.roadmaps()}>Courses</a>
      {/if}
    </nav>
    <h1 class="page-title">{title}</h1>
    {#if topic?.goal || step?.goal}<p class="page-lede">{topic?.goal ?? step?.goal}</p>{/if}
  </header>

  <div class="class-grid">
    <div class="class-main">
      {#if !started}
        <div class="where">
          <p>
            {#if step?.why}{step.why}
            {/if}This class hasn't begun. It opens with the big picture, then finds out what you already know before teaching anything.
          </p>
        </div>
      {:else if pages === null}
        <p class="muted">Loading the class…</p>
      {:else if where}
        <div class="where">
          <p><span class="where-k">Where you are</span> {where.text}</p>
          {#if where.page}<a class="primary" href={link.step(slug, where.page.number)}>{where.action}</a>{/if}
        </div>
      {/if}

      {#if pages?.length}
        <ol class="steps">
          {#each pages as p (p.number)}
            {@const m = stepMark(p)}
            {@const now = p.live && live && p === pages.at(-1)}
            <li>
              <a href={link.step(slug, p.number)} class:now>
                <span class="n">{p.number === 0 ? '' : p.number}</span>
                <span class="t">{p.title ?? (p.upcoming ? 'Warming up' : pageLabel(p))}</span>
                {#if now}<span class="m now-tag">now</span>
                {:else if m.text}<span class="m {m.tone}" title={m.title}>{m.text}</span>{/if}
              </a>
            </li>
          {/each}
        </ol>
      {/if}

      {#if !live}
        <!-- Where he starts or picks it up -->
        <div class="composer resume">
          <div class="composer-row">
            <textarea
              bind:value={text}
              onkeydown={onKey}
              rows="1"
              placeholder={started
                ? `Anything to tell ${tutor.name} first? Or just continue…`
                : 'Say what you want from it, or just start…'}
              aria-label="Your first words to the tutor"></textarea>
            <button class={where?.page ? 'ghost' : 'primary'} onclick={() => begin(text)}>{started ? 'Continue' : 'Start'}</button>
          </div>
          {#if feed.starting}
            <p class="composer-off picking-up"><span class="spinner" aria-hidden="true"></span>{tutor.name} is picking up the class…</p>
          {:else}
            <p class="composer-off">
              {tutor.running ? `${tutor.name} picks it up from here.` : tutor.problem || `This starts ${tutor.name} here in Aristotle.`}
            </p>
          {/if}
        </div>
      {/if}
    </div>

    {#if topic}
      <aside class="class-side" aria-label="What this class teaches">
        <div class="side-head">
          <h2 class="section-title">What you'll understand</h2>
          <span class="muted">{counts.solid} of {counts.total}</span>
        </div>
        {#if counts.total}<StatusBar {counts} fading={counts.fading} />{/if}
        <ul class="concepts">
          {#each concepts as c (c.id)}
            <li>
              <a href={link.topic(slug, c.id)} data-concept="{slug}/{c.id}"><i class="dot {markOf(c)}"></i>{c.label}</a>
            </li>
          {/each}
        </ul>
        <a class="link side-link" href={link.topic(slug)}>See them on the map</a>

        <div class="side-actions">
          {#if counts.fading}<button class="ghost small" onclick={() => actions.review(slug)}>Review {counts.fading} fading</button>{/if}
          {#if counts.solid >= 2}<button class="ghost small" onclick={() => actions.train(slug)}>Train on this class</button>{/if}
          {#each missions as m (m.id)}
            <a class="ghost small" href={link.mission(m.id)}>Mission: {m.title}</a>
          {:else}
            {#if counts.solid >= 2}<button class="ghost small" onclick={getMission}>Plan a mission</button>{/if}
          {/each}
        </div>
      </aside>
    {/if}
  </div>
</div>

<style>
  .class-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, 300px);
    gap: 56px;
    align-items: start;
  }

  @media (max-width: 1000px) {
    .class-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .where {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
    padding: 14px 16px;
    background: var(--b1);
    border-radius: var(--radius-lg);
    line-height: 1.55;
  }

  .where p {
    flex: 1;
    margin: 0;
    color: var(--fg-2);
  }

  .where-k {
    display: block;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--muted);
  }

  .where .primary {
    flex: none;
  }

  .side-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 8px;
  }

  .side-head .section-title {
    margin: 0;
    font-size: 0.95rem;
  }

  .concepts {
    margin: 12px 0 8px;
    padding: 0;
    list-style: none;
    font-size: 0.9rem;
  }

  .concepts a {
    display: flex;
    align-items: baseline;
    gap: 9px;
    padding: 4px 0;
    color: var(--fg-2);
    text-decoration: none;
  }

  .concepts a:hover {
    color: var(--fg);
  }

  .side-link {
    font-size: 0.85rem;
  }

  .side-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 28px;
  }

  .steps {
    margin: 0 0 8px;
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
    padding: 0 0 64px;
    background: none;
  }

  .resume .composer-off {
    margin-top: 6px;
  }
</style>
