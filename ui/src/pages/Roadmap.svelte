<script lang="ts">
  // One course (a roadmap, in the data) as a route: its classes in order down a line, each with its goal, why it sits
  // there, and its progress.
  import { actions } from '../lib/actions.ts';
  import { feed } from '../lib/feed.svelte.ts';
  import { ago } from '../lib/format.ts';
  import { markOf, outline, STATUS_LABEL, STATUS_TONE, stepsOf } from '../lib/library.ts';
  import { link } from '../lib/router.svelte.ts';
  import StatusBar from '../lib/StatusBar.svelte';
  import type { Mission } from '../../../shared/types.ts';

  /** Each step's state: its label, and the tag colour it wears. */
  const STATE = { 'not-started': 'Not started', started: 'In progress', done: 'Done' } as const;
  const STATE_TONE = { 'not-started': '', started: 'shaky', done: 'solid' } as const;

  let { slug }: { slug: string } = $props();

  const roadmap = $derived(feed.roadmaps?.[slug] ?? null);
  const steps = $derived(roadmap ? stepsOf(roadmap, feed.topics) : []);
  const next = $derived(steps.find((s) => s.state !== 'done') ?? null);
  const done = $derived(steps.filter((s) => s.state === 'done').length);
  /** This roadmap's live missions (dropped ones left out). */
  const missions = $derived(feed.missionList.filter((m) => m.roadmap === slug && m.status !== 'dropped'));
  const capstone = $derived(missions.find((m) => m.scope === 'capstone') ?? null);

  function stepMissions(topic: string): Mission[] {
    return missions.filter((m) => m.scope === 'step' && m.topic === topic);
  }
</script>

{#snippet missionLine(m: Mission)}
  <a class="mission-line" href={link.mission(m.id)}>
    <span class="praxis">Mission</span>
    <span class="m-title">{m.title}</span>
    <span class="tag {STATUS_TONE[m.status]}">{STATUS_LABEL[m.status]}</span>
  </a>
{/snippet}

<div class="page">
  {#if roadmap}
    <!-- Header -->
    <header class="page-head">
      <nav class="crumbs"><a href={link.roadmaps()}>Library</a><span class="sep">/</span><span>Course</span></nav>
      <h1 class="page-title">{roadmap.title}</h1>
      <p class="page-lede">{roadmap.goal}</p>
      <div class="head-actions">
        {#if roadmap.status === 'draft'}
          <button class="primary" onclick={() => actions.editRoadmap(slug)}>Keep planning with Claude</button>
        {:else if next}
          <a class="primary" href={link.lesson(next.slug)}>Go to class {next.index + 1}: {next.title}</a>
          <button class="ghost" onclick={() => actions.editRoadmap(slug)}>Change the course</button>
        {:else}
          <button class="ghost" onclick={() => actions.editRoadmap(slug)}>Change the course</button>
        {/if}
        <span class="muted progress-note">{done} of {steps.length} classes done. Changed {ago(roadmap.updated)}.</span>
      </div>
    </header>

    {#if roadmap.status === 'draft'}
      <section class="draft-note">
        <p class="kicker">Draft</p>
        <p>
          Still being planned. Tell Claude what to change (the order, classes to add or drop, a goal that's off) and approve it when it's
          right. Nothing is taught until then.
        </p>
      </section>
    {/if}

    <!-- Steps, then the capstone -->
    <ol class="route-steps">
      {#each steps as s (s.index)}
        {@const isNext = roadmap.status === 'active' && s === next}
        {@const own = stepMissions(s.slug)}
        <li class="route-item {s.state}" class:next={isNext}>
          <div class="rail-col" aria-hidden="true">
            <span class="node">{s.state === 'done' ? '✓' : s.index + 1}</span>
          </div>
          <div class="step-card" class:sheet={isNext}>
            <div class="step-head">
              <h2>
                <a href={link.lesson(s.slug)}>{s.title}</a>
              </h2>
              <span class="tag {STATE_TONE[s.state]}">{STATE[s.state]}</span>
            </div>
            <p class="step-goal">{s.goal}</p>
            {#if s.why}<p class="step-why">{s.why}</p>{/if}
            {#if s.topic && s.counts.total}
              <div class="step-progress">
                <StatusBar counts={s.counts} fading={s.counts.fading} />
                <span class="muted">{s.counts.solid}/{s.counts.total} concepts solid</span>
              </div>
              <ul class="step-concepts">
                {#each outline(s.topic).slice(0, 12) as c (c.id)}
                  <li><a href={link.topic(s.slug, c.id)}><i class="dot {markOf(c)}"></i>{c.label}</a></li>
                {/each}
              </ul>
            {/if}
            {#each own as m (m.id)}{@render missionLine(m)}{/each}
            <div class="step-actions">
              <a class={isNext ? 'primary small' : 'ghost small'} href={link.lesson(s.slug)}>Go</a>
              {#if s.topic}<a class="ghost small" href={link.topic(s.slug)}>Map</a>{/if}
              {#if s.state === 'done' && own.length === 0}
                <button class="ghost small" onclick={() => actions.stepMission(roadmap, s.index)}>Plan a mission</button>
              {/if}
            </div>
          </div>
        </li>
      {/each}
      {#if roadmap.status === 'active' && steps.length}
        <li class="route-item capstone" class:done={capstone?.status === 'reviewed'}>
          <div class="rail-col" aria-hidden="true"><span class="node">★</span></div>
          <div class="step-card">
            <div class="step-head"><h2>Capstone</h2></div>
            {#if capstone}
              {@render missionLine(capstone)}
            {:else}
              <p class="step-goal">
                A bigger mission that uses the whole course at once, in your own life. It opens once every class is done{done ===
                steps.length
                  ? '.'
                  : `: ${steps.length - done} to go.`}
              </p>
              {#if done === steps.length}
                <div class="step-actions">
                  <button class="primary small" onclick={() => actions.capstone(roadmap)}>Design the capstone with Claude</button>
                </div>
              {/if}
            {/if}
          </div>
        </li>
      {/if}
    </ol>
  {:else if feed.roadmaps}
    <div class="empty-state">
      <h2>No such course</h2>
      <p><a href={link.roadmaps()}>Back to the library</a></p>
    </div>
  {:else}
    <p class="muted">Loading…</p>
  {/if}
</div>

<style>
  .progress-note {
    font-size: 0.83rem;
    margin-left: 6px;
  }

  .draft-note {
    max-width: 48rem;
    margin-bottom: 40px;
    padding: 16px 20px;
    border-left: 3px solid var(--marker-solid);
    background: var(--b1);
    border-radius: 0 var(--radius) var(--radius) 0;
  }

  .draft-note p {
    margin: 0;
    font: 0.9rem/1.65 var(--sans);
  }

  .draft-note .kicker {
    font: 500 0.81rem var(--sans);
    margin-bottom: 4px;
  }

  .route-steps {
    list-style: none;
    margin: 0;
    padding: 0;
    max-width: 52rem;
  }

  .route-item {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
  }

  .rail-col {
    position: relative;
    display: flex;
    justify-content: center;
  }

  .rail-col::before {
    content: '';
    position: absolute;
    top: 40px;
    bottom: -6px;
    border-left: 1.5px dotted var(--rule-strong);
  }

  .route-item:last-child .rail-col::before {
    display: none;
  }

  .route-item.done .rail-col::before {
    border-left: 1.5px solid var(--solid);
  }

  .node {
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    margin-top: 2px;
    font: 500 0.87rem var(--sans);
    color: var(--muted);
    background: var(--b0);
    border: 1.5px dashed var(--unknown);
    border-radius: 50%;
  }

  .started .node {
    color: var(--shaky);
    border: 1.5px solid var(--shaky);
  }

  .done .node {
    color: var(--b0);
    background: var(--solid);
    border: 1.5px solid var(--solid);
  }

  .next .node {
    color: var(--paper);
    background: var(--marker-solid);
    border: 1.5px solid var(--marker-solid);
  }

  .step-card {
    margin: 0 0 28px 8px;
    padding: 4px 0 20px;
  }

  .step-card.sheet {
    padding: 22px 26px 24px;
    margin-top: -16px;
  }

  .step-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px 14px;
  }

  h2 {
    margin: 0;
    font-size: 1.15rem;
    line-height: 1.2;
  }

  h2 a {
    color: var(--fg);
    text-decoration: none;
  }

  h2 a:hover {
    color: var(--cyan-ink);
  }

  .not-started h2 {
    color: var(--ink-2);
  }

  .step-goal {
    margin: 8px 0 0;
    font: 0.9rem/1.65 var(--sans);
  }

  .step-why {
    margin: 8px 0 0;
    font: 0.9rem/1.65 var(--sans);
    color: var(--muted);
  }

  .step-progress {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 16px;
    font-size: 0.81rem;
  }

  .step-progress :global(.status-bar) {
    flex: 1;
    max-width: 280px;
  }

  .step-concepts {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    margin: 12px 0 0;
    padding: 0;
    font-size: 0.83rem;
  }

  .step-concepts a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-2);
    text-decoration: none;
  }

  .step-concepts a:hover {
    color: var(--cyan-ink);
  }

  .mission-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
    margin-top: 14px;
    padding: 9px 12px;
    font-size: 0.88rem;
    color: var(--fg);
    text-decoration: none;
    background: var(--b1);
    border-left: 2px solid var(--acc);
    border-radius: 0 var(--radius) var(--radius) 0;
  }

  .mission-line:hover .m-title {
    color: var(--acc);
  }

  .praxis {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--acc);
  }

  .m-title {
    flex: 1;
    min-width: 12rem;
  }

  .capstone .node {
    font-size: 0.95rem;
  }

  .step-actions {
    display: flex;
    gap: 6px;
    margin-top: 16px;
  }
</style>
