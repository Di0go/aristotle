<script lang="ts">
  // Home: a dashboard that answers what to do now (one card, one button), how he is doing (this week, his courses)
  // and what needs him (reviews coming due, recent answers, words he looked up, missions). Lessons happen in their
  // class; the card only points there. Each panel is a short live list with its way onwards at the foot.
  import { actions } from './actions.ts';
  import { claude } from './claude.svelte.ts';
  import { classes } from './classes.svelte.ts';
  import { feed, refetching } from './feed.svelte.ts';
  import { ago, dayKey, formatDay, onDay } from './format.ts';
  import { countsOf, stepsOf } from './library.ts';
  import { link } from './router.svelte.ts';
  import { pageLabel } from './steps.ts';
  import { isFading, type SessionSummary, type Topic } from '../../../shared/types.ts';
  import StartPanel from './StartPanel.svelte';

  const RESULT = { right: 'right', partial: 'partly', wrong: 'wrong', 'dont-know': "didn't know" } as const;
  const TONE = { right: 'ok', partial: 'mx', wrong: 'bad', 'dont-know': 'mx' } as const;
  /** Days shown in the strip of days studied. */
  const DAYS = 14;

  let now = $state(Date.now());
  /** Null until the first answer, so the week's numbers wait instead of showing 0. */
  let sessions = $state<SessionSummary[] | null>(null);

  const topics = $derived(Object.values(feed.topics));
  const courses = $derived(feed.roadmapList.filter((r) => r.status === 'active'));
  const drafts = $derived(feed.roadmapList.filter((r) => r.status === 'draft'));
  /** A sitting going on now (feed.svelte.ts inProgress), read again as the clock ticks. */
  const inProgress = $derived(feed.inProgressAt(now));
  /**
   * The lesson running now, if any: its class and the step being taught. A session left open but idle for long is not
   * running, unless a question in it is still waiting for him.
   */
  const teaching = $derived(feed.session?.kind === 'learn' && feed.liveSlug && (inProgress || feed.pending) ? feed.session : null);
  const teachingPage = $derived(teaching ? (classes.pages(teaching.topicSlug)?.at(-1) ?? null) : null);
  /** With nothing being taught: the class he studied last, still unfinished, to continue. */
  const lastClass = $derived(
    topics
      .filter((t) => t.concepts.length && countsOf(t).solid < countsOf(t).total)
      .sort((a, b) => b.updated.localeCompare(a.updated))[0] ?? null,
  );
  const lastPage = $derived(
    lastClass
      ? (classes
          .pages(lastClass.slug)
          ?.filter((p) => p.number > 0)
          .at(-1) ?? null)
      : null,
  );
  /** With nothing started at all: the first class of a course nobody has begun. */
  const firstClass = $derived.by(() => {
    for (const r of courses) {
      const next = stepsOf(r, feed.topics).find((s) => s.state === 'not-started');
      if (next) return { course: r, step: next };
    }
    return null;
  });
  const waited = $derived(feed.starting ? Math.round((now - feed.starting.at) / 1000) : 0);

  // This week, and the strip of days studied. They follow the day, not the clock: the same until midnight.
  const today = $derived(dayKey(new Date(now)));
  const monday = $derived.by(() => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  });
  const minutes = $derived((sessions ?? []).filter((s) => Date.parse(s.startedAt) >= monday).reduce((n, s) => n + s.activeMinutes, 0));
  const solidThisWeek = $derived(
    topics.flatMap((t) => t.concepts).filter((c) => c.status === 'solid' && c.solidSince && Date.parse(c.solidSince) >= monday).length,
  );
  const studied = $derived(new Set((sessions ?? []).map((s) => dayKey(new Date(s.startedAt)))));
  const days = $derived(
    Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(`${today}T12:00:00`);
      d.setDate(d.getDate() - (DAYS - 1 - i));
      return { key: dayKey(d), label: formatDay(d.toISOString()), on: studied.has(dayKey(d)) };
    }),
  );
  /** Days in a row with a sitting, up to today (or yesterday, when today hasn't had one yet). */
  const streak = $derived.by(() => {
    let n = 0;
    const d = new Date(`${today}T12:00:00`);
    if (!studied.has(dayKey(d))) d.setDate(d.getDate() - 1);
    while (studied.has(dayKey(d))) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  });

  // What needs him.
  const fading = $derived(topics.reduce((n, t) => n + countsOf(t).fading, 0));
  /** Solid concepts by when they come due for review, soonest first. */
  const due = $derived(
    topics
      .flatMap((t) => t.concepts.filter((c) => c.status === 'solid' && c.review).map((c) => ({ topic: t, concept: c })))
      .sort((a, b) => a.concept.review!.due.localeCompare(b.concept.review!.due))
      .slice(0, 4),
  );
  /** His latest graded answers across every class. */
  const recent = $derived(
    topics
      .flatMap((t) =>
        t.concepts.flatMap((c) =>
          c.evidence.filter((e) => e.result && e.kind !== 'practice').map((e) => ({ topic: t, concept: c, at: e.at, result: e.result! })),
        ),
      )
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 5),
  );
  const words = $derived([...feed.glosses].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5));
  const missions = $derived(feed.missionList.filter((m) => m.status === 'open' || m.status === 'debriefed'));

  refetching(
    () => feed.sessions(),
    (all) => (sessions = all),
  );

  // A lesson asked for while its class wasn't known (a new one): once it is live, go to the step being taught.
  $effect(() => {
    const href = classes.liveHref();
    if (feed.follow !== '*' || !teaching || !href) return;
    feed.follow = null;
    location.hash = href;
  });

  // A clock, so the week turns over at midnight: once a minute, or every second while "still setting up (40 s)" counts.
  $effect(() => {
    const every = feed.starting ? 1000 : 60_000;
    now = Date.now();
    const t = setInterval(() => (now = Date.now()), every);
    return () => clearInterval(t);
  });

  /** "The stress response · Step 3: The fast arm". */
  function where(t: Topic | { topic: string }, p: { number: number; title?: string } | null): string {
    const title = 'title' in t ? t.title : t.topic;
    if (!p) return title;
    return `${title} · ${pageLabel(p as never)}${p.title ? `: ${p.title}` : ''}`;
  }
</script>

<div class="page home">
  {#if !feed.loaded}
    <!-- Until everything has loaded at once: the shape of the page, quietly, rather than empty lists that then jump. -->
    <div class="skeleton" aria-busy="true" aria-label="Loading">
      <div class="now sheet sk-now"><span class="sk w30"></span><span class="sk w60 tall"></span><span class="sk w45"></span></div>
      <div class="panels">
        {#each [0, 1, 2, 3, 4, 5] as i (i)}
          <section class="panel sk-panel">
            <span class="sk w40"></span><span class="sk w90"></span><span class="sk w75"></span><span class="sk w60"></span>
          </section>
        {/each}
      </div>
    </div>
  {:else}
    <!-- What to do now: one card, one primary button. -->
    {#if feed.starting}
      <section class="now sheet" aria-live="polite">
        <span class="spinner" aria-hidden="true"></span>
        <div class="now-text">
          <p class="now-k">Starting</p>
          <p class="now-title">{feed.starting.label}</p>
          <p class="muted">
            {#if claude.asking}
              Claude is asking something in the terminal before it can begin.
            {:else if waited > 40}
              Still setting up ({waited} s). Claude may be reading your notes, or waiting in the terminal.
            {:else}
              Claude is preparing it. You'll be taken to it as soon as it starts.
            {/if}
          </p>
        </div>
        <button class={claude.asking ? 'primary' : 'ghost'} onclick={() => claude.toggle(true)}>Open the terminal</button>
        <button class="link" onclick={() => (feed.starting = null)}>Dismiss</button>
      </section>
    {:else if teaching}
      <a class="now sheet live" href={classes.liveHref() ?? link.lesson(teaching.topicSlug)}>
        <span class="live-dot" aria-hidden="true"></span>
        <span class="now-text">
          <span class="now-k">{feed.pending ? 'Your turn' : 'Being taught now'}</span>
          <span class="now-title">{where(teaching, teachingPage)}</span>
          <span class="muted"
            >{feed.pending
              ? inProgress
                ? 'A question is waiting for your answer.'
                : `A question has been waiting since ${ago(feed.pending.at)}; answering it picks the class up again.`
              : 'Claude is teaching; follow along in the class.'}</span
          >
        </span>
        <span class="primary">{feed.pending ? 'Answer it' : 'Open the class'}</span>
      </a>
      {#if !inProgress && fading}
        <!-- A question left waiting since another day shouldn't hide what is fading. -->
        <p class="now-also">
          Or review the {fading}
          {fading === 1 ? 'concept' : 'concepts'} fading first:
          <button class="primary small" onclick={() => actions.review()}>Review now</button>
        </p>
      {/if}
    {:else if fading}
      <!-- Spaced review comes first: recalling a concept just as it fades is what makes it last. -->
      <section class="now sheet">
        <span class="now-text">
          <span class="now-k">Time to review</span>
          <span class="now-title">{fading} {fading === 1 ? 'concept is' : 'concepts are'} fading</span>
          <span class="muted"
            >Recall {fading === 1 ? 'it' : 'them'} now, just before {fading === 1 ? 'it slips' : 'they slip'}: a few questions you answer in
            your own words.{#if lastClass}
              Or <button class="link inline" onclick={() => actions.continueTopic(lastClass.slug)}>continue {lastClass.title}</button
              >.{/if}</span
          >
        </span>
        <button class="primary" onclick={() => actions.review()}>Review now</button>
      </section>
    {:else if lastClass}
      <section class="now sheet">
        <span class="now-text">
          <span class="now-k">Pick up where you left off</span>
          <a class="now-title" href={link.lesson(lastClass.slug)}>{where(lastClass, lastPage)}</a>
          <span class="muted"
            >Studied {ago(lastClass.updated)}. {countsOf(lastClass).solid} of {countsOf(lastClass).total} concepts solid.</span
          >
        </span>
        <button class="primary" onclick={() => actions.continueTopic(lastClass.slug)}>Continue</button>
      </section>
    {:else if firstClass}
      <section class="now sheet">
        <span class="now-text">
          <span class="now-k">Next in {firstClass.course.title}</span>
          <a class="now-title" href={link.lesson(firstClass.step.slug)}>{firstClass.step.title}</a>
          <span class="muted">Class {firstClass.step.index + 1} of {firstClass.course.steps.length}.</span>
        </span>
        <button class="primary" onclick={() => actions.startStep(firstClass.course, firstClass.step.index)}>Start</button>
      </section>
    {/if}

    {#if topics.length === 0 && courses.length === 0}
      <header class="page-head">
        <h1 class="page-title">What do you want to learn?</h1>
        <p class="page-lede">Plan a course towards something bigger, or start one class straight away.</p>
      </header>
    {:else}
      <!-- How he is doing, and what needs him. -->
      <div class="panels">
        <section class="panel">
          <h2 class="panel-h">This week</h2>
          <div class="stats">
            <div><span class="big">{sessions ? minutes : '–'}</span><span class="cap">min studied</span></div>
            <div><span class="big">{solidThisWeek}</span><span class="cap">concepts solid</span></div>
            <div><span class="big">{sessions ? streak : '–'}</span><span class="cap">{streak === 1 ? 'day' : 'days'} in a row</span></div>
          </div>
          <ol class="days" aria-label="Days studied, last two weeks">
            {#each days as d (d.key)}<li class:on={d.on} title="{d.label}{d.on ? ': studied' : ''}"></li>{/each}
          </ol>
          <a class="panel-foot" href={link.progress()}>Charts</a>
        </section>

        <section class="panel">
          <h2 class="panel-h">Courses <span>{courses.length}</span></h2>
          {#each courses as r (r.slug)}
            {@const steps = stepsOf(r, feed.topics)}
            {@const done = steps.filter((s) => s.state === 'done').length}
            {@const at = steps.find((s) => s.state !== 'done')}
            <a class="item" href={link.roadmap(r.slug)}>
              <span class="item-t">{r.title}</span>
              <span class="item-m">{at ? `class ${at.index + 1} of ${steps.length}` : 'done'}</span>
            </a>
            <div class="bar" aria-label="{done} of {steps.length} classes done">
              {#each steps as s (s.index)}<i class={s.state}></i>{/each}<i class="final" title="Final mission"></i>
            </div>
          {:else}
            <p class="empty">A course is a path of classes towards something bigger.</p>
          {/each}
          {#each drafts as r (r.slug)}
            <a class="item" href={link.roadmap(r.slug)}><span class="item-t">{r.title}</span><span class="item-m">being planned</span></a>
          {/each}
          <a class="panel-foot" href={link.roadmaps()}>Plan a course</a>
        </section>

        <section class="panel">
          <h2 class="panel-h">To review <span>{fading ? `${fading} fading` : 'soon'}</span></h2>
          {#each due as d (`${d.topic.slug}/${d.concept.id}`)}
            <a class="item" href={link.topic(d.topic.slug, d.concept.id)} data-concept="{d.topic.slug}/{d.concept.id}">
              <span class="item-t">{d.concept.label}</span>
              <span class="item-m" class:todo={isFading(d.concept)}>{isFading(d.concept) ? 'fading' : onDay(d.concept.review!.due)}</span>
            </a>
          {:else}
            <p class="empty">Concepts come here once they're solid, to be recalled just before they fade.</p>
          {/each}
          {#if fading}
            <button class="primary small panel-action" onclick={() => actions.review()}>Review {fading} fading</button>
          {/if}
        </section>

        <section class="panel">
          <h2 class="panel-h">Recent answers</h2>
          {#each recent as r, i (i)}
            <a class="item" href={link.topic(r.topic.slug, r.concept.id)} data-concept="{r.topic.slug}/{r.concept.id}">
              <span class="item-t">{r.concept.label}</span>
              <span class="item-m {TONE[r.result]}">{RESULT[r.result]}</span>
            </a>
          {:else}
            <p class="empty">Your answers to checks show up here.</p>
          {/each}
          <a class="panel-foot" href={link.log()}>History</a>
        </section>

        <section class="panel">
          <h2 class="panel-h">Words you looked up <span>{feed.glosses.length || ''}</span></h2>
          {#each words as g (g.id)}
            <a class="item" href={g.topic ? link.lesson(g.topic) : link.now()}>
              <span class="item-t term gloss" data-gloss={g.id}>{g.text}</span>
              <span class="item-m">{ago(g.at)}</span>
            </a>
          {:else}
            <p class="empty">Select a word you don't know in a lesson, right-click it and choose Gloss.</p>
          {/each}
        </section>

        <section class="panel">
          <h2 class="panel-h">Missions <span>{missions.length || ''}</span></h2>
          {#each missions as m (m.id)}
            <a class="item" href={link.mission(m.id)}>
              <span class="item-t">{m.title}</span>
              <span class="item-m" class:todo={m.status === 'open'}>{m.status === 'open' ? 'to do' : 'to review'}</span>
            </a>
          {:else}
            <p class="empty">
              Every course ends with a mission that puts it to work in your own life. Claude designs it as soon as the last class is done.
            </p>
          {/each}
          <a class="panel-foot" href={link.praxis()}>All missions</a>
        </section>
      </div>
    {/if}
  {/if}

  <section class="home-section start-section">
    <h2 class="section-title">Something new</h2>
    <div class="sheet start-sheet"><StartPanel /></div>
  </section>
</div>

<style>
  .now {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 28px;
    padding: 18px 20px;
    color: var(--fg);
    text-decoration: none;
  }

  .now.live {
    border-color: var(--acc-line);
  }

  .now.live:hover {
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

  .now-text {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 2px;
    min-width: 0;
  }

  .now-k {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--acc);
  }

  .now-title {
    font-size: 1.12rem;
    font-weight: 600;
    color: var(--fg);
    text-decoration: none;
  }

  a.now-title:hover {
    color: var(--acc);
  }

  .now .muted {
    margin: 0;
    font-size: 0.88rem;
  }

  .panels {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
    margin-bottom: 48px;
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding: 16px 18px 14px;
    background: var(--b1);
    border-radius: var(--radius-lg);
  }

  .panel-h {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin: 0 0 8px;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .panel-h span {
    font-size: 0.8rem;
    font-weight: 400;
    color: var(--faint);
  }

  .item {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 5px 0;
    color: var(--fg-2);
    text-decoration: none;
    font-size: 0.9rem;
  }

  .item:hover .item-t {
    color: var(--fg);
  }

  .item-t {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-t.term {
    flex: 0 1 auto;
  }

  .item-m {
    flex: none;
    margin-left: auto;
    font-size: 0.78rem;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }

  .item-m.ok {
    color: var(--solid);
  }

  .item-m.mx {
    color: var(--shaky);
  }

  .item-m.bad {
    color: var(--wrong);
  }

  .item-m.todo {
    color: var(--acc);
  }

  .empty {
    margin: 0;
    font-size: 0.86rem;
    color: var(--faint);
    line-height: 1.5;
  }

  .panel-foot {
    align-self: flex-start;
    margin-top: auto;
    padding-top: 10px;
    font-size: 0.84rem;
    color: var(--acc);
  }

  .panel-action {
    align-self: flex-start;
    margin-top: auto;
  }

  .now-also {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: -16px 0 28px;
    padding: 0 20px;
    font-size: 0.88rem;
    color: var(--muted);
  }

  .now .link.inline {
    padding: 0;
    font: inherit;
  }

  .stats {
    display: flex;
    gap: 22px;
    margin: 2px 0 12px;
  }

  .stats div {
    display: flex;
    flex-direction: column;
  }

  .big {
    font-size: 1.7rem;
    font-weight: 600;
    line-height: 1.1;
    color: var(--fg);
    font-variant-numeric: tabular-nums;
  }

  .cap {
    font-size: 0.78rem;
    color: var(--muted);
  }

  .days {
    display: grid;
    grid-template-columns: repeat(14, 1fr);
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .days li {
    aspect-ratio: 1;
    border-radius: 3px;
    background: var(--b2);
  }

  .days li.on {
    background: var(--solid);
  }

  .bar {
    display: flex;
    gap: 3px;
    margin: 2px 0 8px;
  }

  .bar i {
    flex: 1;
    height: 5px;
    border-radius: 3px;
    background: var(--b2);
  }

  .bar i.started {
    background: color-mix(in srgb, var(--acc) 55%, var(--b2));
  }

  .bar i.done {
    background: var(--solid);
  }

  .bar i.final {
    flex: 0.6;
    background: transparent;
    border: 1.5px dashed var(--shaky);
  }

  .start-section {
    margin-top: 8px;
  }

  .sk-now {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    min-height: 112px;
  }

  .sk-panel {
    gap: 12px;
    min-height: 240px;
  }
</style>
