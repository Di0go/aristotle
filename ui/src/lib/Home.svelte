<script lang="ts">
  // Home: everything in progress side by side, so picking what to do is one click, and the lesson being taught
  // right now (it happens in its class: this only points there).
  import { actions } from './actions.ts';
  import { claude } from './claude.svelte.ts';
  import { classes } from './classes.svelte.ts';
  import { feed } from './feed.svelte.ts';
  import { ago } from './format.ts';
  import { countsOf, placeOf, stepsOf } from './library.ts';
  import { link } from './router.svelte.ts';
  import { stepState } from '../../../shared/types.ts';
  import StartPanel from './StartPanel.svelte';
  import StatusBar from './StatusBar.svelte';

  let now = $state(Date.now());

  const roadmaps = $derived(feed.roadmapList.filter((r) => r.status === 'active'));
  const drafts = $derived(feed.roadmapList.filter((r) => r.status === 'draft'));
  const inProgress = $derived(
    Object.values(feed.topics)
      .filter((t) => t.concepts.length && stepState(t) !== 'done')
      .sort((a, b) => b.updated.localeCompare(a.updated)),
  );
  /** For each roadmap, the first step nobody has started, if the ones before it are under way. */
  const nextSteps = $derived(
    roadmaps.flatMap((r) => {
      const steps = stepsOf(r, feed.topics);
      const next = steps.find((s) => s.state === 'not-started');
      return next ? [{ roadmap: r, step: next, done: steps.filter((s) => s.state === 'done').length, total: steps.length }] : [];
    }),
  );
  const fading = $derived(Object.values(feed.topics).reduce((n, t) => n + countsOf(t).fading, 0));
  const last = $derived(feed.session?.endedAt ? feed.session : null);
  const waited = $derived(feed.starting ? Math.round((now - feed.starting.at) / 1000) : 0);
  /** The lesson running now, if any: its class and the step being taught. */
  const teaching = $derived(feed.session?.kind === 'learn' && feed.liveSlug ? feed.session : null);
  const teachingPage = $derived(teaching ? (classes.pages(teaching.topicSlug)?.at(-1) ?? null) : null);
  const empty = $derived(feed.loaded && inProgress.length === 0 && nextSteps.length === 0);

  // A lesson asked for while its topic wasn't known (a new one): once it is live, go to the step being taught.
  $effect(() => {
    const href = classes.liveHref();
    if (feed.follow !== '*' || !teaching || !href) return;
    feed.follow = null;
    location.hash = href;
  });

  // A clock for "still setting up (40 s)" while something is starting.
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });
</script>

<div class="page home">
  {#if feed.starting}
    <section class="starting sheet" aria-live="polite">
      <div class="starting-line">
        <span class="spinner" aria-hidden="true"></span>
        <div>
          <p class="starting-title">{feed.starting.label}</p>
          <p class="muted">
            {#if claude.asking}
              Claude is asking something in the terminal before it can begin.
            {:else if waited > 40}
              Still setting up ({waited} s). Claude may be reading your notes, or waiting in the terminal.
            {:else}
              Claude is preparing it. The lesson opens here as soon as it starts.
            {/if}
          </p>
        </div>
      </div>
      <div class="starting-actions">
        <button class={claude.asking ? 'primary small' : 'ghost small'} onclick={() => claude.toggle(true)}>Open the terminal</button>
        <button class="link" onclick={() => (feed.starting = null)}>Dismiss</button>
      </div>
    </section>
  {/if}

  {#if teaching}
    <a class="teaching sheet" href={classes.liveHref() ?? link.lesson(teaching.topicSlug)}>
      <span class="live-dot" aria-hidden="true"></span>
      <span class="teaching-text">
        <span class="kicker">{feed.pending ? 'Your turn' : 'Being taught now'}</span>
        <span class="teaching-title"
          >{teaching.topic}{#if teachingPage}<span class="muted">
              {` · `}{teachingPage.number ? `Step ${teachingPage.number}` : 'Intro'}{teachingPage.title
                ? `: ${teachingPage.title}`
                : ''}</span
            >{/if}</span
        >
      </span>
      <span class="primary small">Open</span>
    </a>
  {/if}

  <header class="page-head">
    <h1 class="page-title">{empty ? 'What do you want to learn?' : 'Pick up where you left off'}</h1>
    {#if !empty}
      <p class="page-lede">Everything in progress, side by side. Continue one, start the next step of a roadmap, or begin something new.</p>
    {/if}
  </header>

  {#if last}
    <section class="last-session">
      <p class="kicker">Last session, {ago(last.endedAt!)}</p>
      <p><a href={link.session(last.id)}>{last.topic}</a>: {last.goal}</p>
    </section>
  {/if}

  {#if fading}
    <section class="review-callout">
      <div>
        <h2>{fading} {fading === 1 ? 'concept is' : 'concepts are'} fading</h2>
        <p class="muted">Solid once, now due. Recalling them just as they fade is what makes them last.</p>
      </div>
      <button class="primary" onclick={() => actions.review()}>Review now</button>
    </section>
  {/if}

  {#if inProgress.length}
    <section class="home-section">
      <h2 class="section-title">In progress</h2>
      <ul class="desk">
        {#each inProgress as t (t.slug)}
          {@const place = placeOf(t.slug, feed.roadmapList)}
          {@const c = countsOf(t)}
          <li class="desk-item sheet">
            {#if place}
              <a class="desk-where" href={link.roadmap(place.roadmap.slug)}
                >{place.roadmap.title}, topic {place.index + 1} of {place.roadmap.steps.length}</a
              >
            {/if}
            <h3><a href={link.lesson(t.slug)}>{t.title}</a></h3>
            {#if t.handoff}
              <p class="desk-next"><span class="muted">Next:</span> {t.handoff.next}</p>
            {:else}
              <p class="desk-next muted">{t.goal}</p>
            {/if}
            <div class="desk-foot">
              <div class="desk-progress">
                <StatusBar counts={c} fading={c.fading} />
                <span class="muted">{c.solid} of {c.total} concepts solid, studied {ago(t.updated)}</span>
              </div>
              <a class="primary small" href={link.lesson(t.slug)}>Go</a>
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if nextSteps.length}
    <section class="home-section">
      <h2 class="section-title">Next on your roadmaps</h2>
      <ul class="next-steps">
        {#each nextSteps as n (n.roadmap.slug)}
          <li>
            <span class="tag cyan">{n.step.index + 1}/{n.total}</span>
            <div>
              <p class="next-title"><a href={link.lesson(n.step.slug)}>{n.step.title}</a> <span class="muted">· {n.roadmap.title}</span></p>
              <p class="muted">{n.step.goal}</p>
            </div>
            <a class="ghost small" href={link.lesson(n.step.slug)}>Go</a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if drafts.length}
    <section class="home-section">
      <h2 class="section-title">Roadmaps still being planned</h2>
      <ul class="next-steps">
        {#each drafts as r (r.slug)}
          <li>
            <span class="tag">draft</span>
            <div>
              <p class="next-title"><a href={link.roadmap(r.slug)}>{r.title}</a></p>
              <p class="muted">{r.goal}</p>
            </div>
            <a class="ghost small" href={link.roadmap(r.slug)}>Open</a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="home-section start-section">
    <h2 class="section-title">{empty ? 'Start here' : 'Something new'}</h2>
    <div class="sheet start-sheet"><StartPanel /></div>
  </section>
</div>

<style>
  .teaching {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 36px;
    padding: 16px 18px;
    color: var(--fg);
    text-decoration: none;
    border: 1px solid var(--acc-line);
  }

  .teaching:hover {
    border-color: var(--acc);
    text-decoration: none;
  }

  .live-dot {
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--acc);
  }

  .teaching-text {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 2px;
  }

  .teaching .kicker {
    margin: 0;
    color: var(--acc);
  }

  .teaching-title {
    font-weight: 600;
  }

  .teaching-title .muted {
    font-weight: 400;
  }
</style>
