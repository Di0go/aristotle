<script lang="ts">
  // A topic's page: its knowledge map as a graph, the concept panel, the outline and its sessions.
  import { actions } from '../lib/actions.ts';
  import { feed, topicSessions } from '../lib/feed.svelte.ts';
  import { ago, formatDay, formatTime, sessionStats } from '../lib/format.ts';
  import { countsOf, markOf, outline, placeOf } from '../lib/library.ts';
  import { link } from '../lib/router.svelte.ts';
  import ConceptPanel from '../lib/ConceptPanel.svelte';
  import MapGraph from '../lib/MapGraph.svelte';
  import StatusBar from '../lib/StatusBar.svelte';
  import type { SessionSummary } from '../../../shared/types.ts';

  let { slug, concept = undefined }: { slug: string; concept?: string } = $props();

  let missing = $state(false);
  let selected = $state<string | null>(null);
  let sessions = $state<SessionSummary[]>([]);

  const topic = $derived(feed.topics[slug] ?? null);
  const counts = $derived(countsOf(topic ?? undefined));
  const place = $derived(placeOf(slug, feed.roadmapList));
  const step = $derived(place ? place.roadmap.steps[place.index] : null);
  /** This topic's own live missions: capstones belong to the roadmap, dropped ones are left out. */
  const missions = $derived(feed.missionList.filter((m) => m.topic === slug && m.scope !== 'capstone' && m.status !== 'dropped'));
  const chosen = $derived(topic?.concepts.find((c) => c.id === selected) ?? null);
  const ordered = $derived(topic ? outline(topic) : []);
  /** What the handoff says is still shaky, unless it says nothing is. */
  const shaky = $derived(topic?.handoff?.shaky && topic.handoff.shaky.toLowerCase() !== 'nothing' ? topic.handoff.shaky : '');

  $effect(() => {
    selected = concept ?? null;
  });

  $effect(() => {
    missing = false;
    // Once loaded, the feed holds every topic, so one it doesn't have doesn't exist (yet).
    if (feed.loaded && !feed.topics[slug]) missing = true;
  });

  // Only the latest request may write, so a slow older reply can't overwrite a newer one.
  let request = 0;
  $effect(() => {
    void feed.topicVersion;
    const mine = ++request;
    void topicSessions(slug).then((all) => {
      if (mine === request) sessions = all;
    });
  });

  /** Selects a concept, keeping it in the address without adding a history entry. */
  function select(id: string | null) {
    selected = id;
    history.replaceState(null, '', link.topic(slug, id ?? undefined));
  }

  /** Clicking the selected concept again deselects it. */
  function toggle(id: string) {
    select(selected === id ? null : id);
  }

  /** A mission for this topic: the step's mission when it sits on a roadmap, a topic mission otherwise. */
  function getMission() {
    if (place) actions.stepMission(place.roadmap, place.index);
    else actions.topicMission(slug);
  }
</script>

<div class="page topic-page">
  {#if topic}
    <!-- Header -->
    <header class="page-head">
      <nav class="crumbs" aria-label="Where this is">
        {#if place}
          <a href={link.roadmap(place.roadmap.slug)}>{place.roadmap.title}</a>
          <span class="sep">/</span>
          <span>Step {place.index + 1} of {place.roadmap.steps.length}</span>
        {:else}
          <a href={link.topics()}>Other topics</a>
        {/if}
      </nav>
      <h1 class="page-title">{topic.title}</h1>
      <p class="page-lede">{topic.goal}</p>
      {#if step?.why}<p class="why muted">{step.why}</p>{/if}
      <div class="head-actions">
        <a class="primary" href={link.lesson(slug)}>Go to the class</a>
        {#if counts.solid >= 2}<button class="ghost" onclick={() => actions.train(slug)}>Train on it</button>{/if}
        {#if counts.fading}<button class="ghost" onclick={() => actions.review(slug)}>Review {counts.fading} fading</button>{/if}
        {#each missions as m (m.id)}
          <a class="ghost" href={link.mission(m.id)}>Praxis: {m.title}</a>
        {:else}
          {#if counts.solid >= 2}
            <button class="ghost" onclick={getMission}>Get a Praxis mission</button>
          {/if}
        {/each}
      </div>
    </header>

    {#if topic.handoff}
      <section class="handoff">
        <p class="kicker">Next time</p>
        <p class="handoff-next">{topic.handoff.next}</p>
        {#if shaky}
          <details>
            <summary>What's still shaky</summary>
            <p class="muted handoff-shaky">{shaky}</p>
          </details>
        {/if}
      </section>
    {/if}

    <!-- Outline and sessions beside the map -->
    <div class="topic-grid">
      <aside class="topic-side">
        <section>
          <div class="side-head">
            <h2 class="section-title">Outline</h2>
            {#if counts.total}<span class="muted">{counts.solid}/{counts.total} solid</span>{/if}
          </div>
          {#if counts.total}<StatusBar {counts} fading={counts.fading} />{/if}
          {#if ordered.length}
            <ol class="outline">
              {#each ordered as c (c.id)}
                <li class:on={selected === c.id} class:focus={topic.focus === c.id}>
                  <button class="link-button" onclick={() => toggle(c.id)} data-concept="{slug}/{c.id}">
                    <i class="dot {markOf(c)}"></i>
                    <span class="outline-label" class:goal={c.goal}>{c.label}</span>
                  </button>
                </li>
              {/each}
            </ol>
          {:else}
            <p class="muted">The outline appears once the first lesson has mapped the topic.</p>
          {/if}
        </section>

        {#if sessions.length}
          <section>
            <h2 class="section-title">Sessions</h2>
            <ul class="sessions">
              {#each sessions as s (s.id)}
                <li>
                  <a href={link.session(s.id)}>
                    <span class="when">{formatDay(s.startedAt)}, {formatTime(s.startedAt)}</span>
                    <span class="what">{s.goal}</span>
                    <span class="muted stats">{sessionStats(s)}</span>
                  </a>
                </li>
              {/each}
            </ul>
          </section>
        {/if}
      </aside>

      <div class="topic-main">
        <section class="map-sheet graph-paper">
          <MapGraph {topic} others={feed.topics} direction="TB" {selected} onselect={toggle} />
          <div class="map-legend legend">
            <span><i class="dot solid"></i>Solid</span>
            <span><i class="dot fading"></i>Fading</span>
            <span><i class="dot shaky"></i>Shaky</span>
            <span><i class="dot"></i>Not yet</span>
            <span>Arrows run from a concept to what builds on it</span>
          </div>
        </section>
        {#if chosen}
          <ConceptPanel {topic} concept={chosen} onselect={(id) => select(id)} onclose={() => select(null)} />
        {/if}
        <p class="muted updated">Last studied {ago(topic.updated)}{topic.training ? `, training level ${topic.training.level}/10` : ''}.</p>
      </div>
    </div>
  {:else if place && step && (missing || feed.loaded)}
    <!-- A roadmap step nobody has started: a preview to look at, and an explicit way to begin. -->
    {@const before = place.roadmap.steps.slice(0, place.index)}
    <header class="page-head">
      <nav class="crumbs" aria-label="Where this is">
        <a href={link.roadmap(place.roadmap.slug)}>{place.roadmap.title}</a>
        <span class="sep">/</span>
        <span>Step {place.index + 1} of {place.roadmap.steps.length}</span>
      </nav>
      <h1 class="page-title">{step.title}</h1>
      <dl class="props">
        <dt>status</dt>
        <dd>Not started</dd>
        <dt>goal</dt>
        <dd>{step.goal}</dd>
        {#if before.length}<dt>builds on</dt>
          <dd>
            {#each before as b, i (b.topic)}{#if i}{', '}{/if}<a href={link.topic(b.topic)}>{b.title}</a>{/each}
          </dd>{/if}
      </dl>
      {#if step.why}<p class="why muted">{step.why}</p>{/if}
      <div class="head-actions">
        <a class="primary" href={link.lesson(slug)}>Go to the class</a>
        <a class="ghost" href={link.roadmap(place.roadmap.slug)}>See the whole roadmap</a>
      </div>
    </header>
    <p class="muted not-yet">The map of this topic appears once its first lesson finds out what you already know and plans the path.</p>
  {:else if missing}
    <div class="empty-state">
      <h2>No such topic</h2>
      <p><a href={link.now()}>Back to Home</a></p>
    </div>
  {:else}
    <p class="muted">Loading…</p>
  {/if}
</div>

<style>
  .not-yet {
    max-width: 44rem;
    font-size: 0.9rem;
  }

  .why {
    max-width: 44rem;
    margin: 10px 0 0;
    font: 0.9rem/1.65 var(--sans);
  }

  .topic-grid {
    display: grid;
    grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
    gap: 48px;
    align-items: start;
  }

  @media (max-width: 1100px) {
    .topic-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .topic-main {
      order: -1;
    }
  }

  .topic-side {
    display: grid;
    gap: 40px;
  }

  .topic-side .section-title {
    font-size: 1.02rem;
    margin: 0;
  }

  .side-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 10px;
    font-size: 0.8rem;
  }

  .handoff {
    max-width: 52rem;
    margin: -12px 0 48px;
    padding: 18px 22px;
    border-left: 3px solid var(--marker-solid);
    background: var(--b1);
    border-radius: 0 var(--radius) var(--radius) 0;
  }

  .handoff .kicker {
    margin-bottom: 4px;
  }

  .handoff-next {
    margin: 0;
    font: 0.9rem/1.65 var(--sans);
  }

  .handoff-shaky {
    margin: 8px 0 0;
    font-size: 0.87rem;
    line-height: 1.5;
  }

  details {
    margin-top: 10px;
    font-size: 0.83rem;
  }

  summary {
    color: var(--muted);
    cursor: pointer;
  }

  .outline {
    list-style: none;
    margin: 14px 0 0;
    padding: 0;
    counter-reset: outline;
  }

  .outline li {
    counter-increment: outline;
  }

  .outline button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 6px 8px;
    border-radius: var(--radius);
    font-size: 0.91rem;
    color: var(--ink-2);
  }

  .outline button::before {
    content: counter(outline);
    min-width: 1.4em;
    font: 0.7rem var(--sans);
    color: var(--muted);
  }

  .outline button:hover {
    background: var(--b1);
    color: var(--fg);
  }

  .outline li.on button {
    background: var(--cyan-soft);
    color: var(--fg);
  }

  .outline li.focus button {
    background: var(--marker);
  }

  .outline-label.goal {
    text-decoration: underline double var(--acc);
    text-underline-offset: 0.22em;
  }

  .sessions {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .sessions a {
    display: grid;
    gap: 2px;
    padding: 12px 0;
    border-top: 1px solid var(--rule);
    color: var(--fg);
    text-decoration: none;
  }

  .sessions a:hover .what {
    color: var(--cyan-ink);
  }

  .sessions .when {
    font: 0.76rem var(--sans);
    color: var(--muted);
  }

  .sessions .what {
    font: 0.9rem/1.65 var(--sans);
  }

  .sessions .stats {
    font-size: 0.78rem;
  }

  .topic-main {
    display: grid;
    gap: 20px;
    min-width: 0;
  }

  .map-sheet {
    padding: 20px;
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    overflow-x: auto;
  }

  .map-legend {
    margin-top: 16px;
  }

  .updated {
    margin: 0;
    font-size: 0.81rem;
  }
</style>
