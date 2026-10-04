<script lang="ts">
  // One roadmap as a route: steps in order down a line, each with its goal, why it sits there, and its progress.
  import { feed } from '../lib/feed.svelte.ts';
  import { link } from '../lib/router.svelte.ts';
  import { actions } from '../lib/actions.ts';
  import { ago } from '../lib/format.ts';
  import { markOf, outline, stepsOf } from '../lib/library.ts';
  import StatusBar from '../lib/StatusBar.svelte';

  let { slug }: { slug: string } = $props();

  const roadmap = $derived(feed.roadmaps?.[slug] ?? null);
  const steps = $derived(roadmap ? stepsOf(roadmap, feed.topics) : []);
  const next = $derived(steps.find((s) => s.state !== 'done') ?? null);
  const done = $derived(steps.filter((s) => s.state === 'done').length);
  const STATE = { 'not-started': 'Not started', started: 'In progress', done: 'Done' } as const;

</script>

<div class="page">
  {#if roadmap}
    <header class="page-head">
      <nav class="crumbs"><a href={link.roadmaps()}>Library</a><span class="sep">/</span><span>Roadmap</span></nav>
      <h1 class="page-title">{roadmap.title}</h1>
      <p class="page-lede">{roadmap.goal}</p>
      <div class="head-actions">
        {#if roadmap.status === 'draft'}
          <button class="primary" onclick={() => actions.editRoadmap(slug)}>Keep planning with Claude</button>
        {:else if next}
          <a class="primary" href={link.lesson(next.slug)}>Go to step {next.index + 1}: {next.title}</a>
          <button class="ghost" onclick={() => actions.editRoadmap(slug)}>Change the roadmap</button>
        {:else}
          <button class="ghost" onclick={() => actions.editRoadmap(slug)}>Change the roadmap</button>
        {/if}
        <span class="muted progress-note">{done} of {steps.length} steps done. Changed {ago(roadmap.updated)}.</span>
      </div>
    </header>

    {#if roadmap.status === 'draft'}
      <section class="draft-note">
        <p class="kicker">Draft</p>
        <p>Still being planned. Tell Claude what to change (the order, steps to add or drop, a goal that's off) and approve it when it's right. Nothing is taught until then.</p>
      </section>
    {/if}

    <ol class="route-steps">
      {#each steps as s (s.index)}
        {@const isNext = roadmap.status === 'active' && s === next}
        <li class="route-item {s.state}" class:next={isNext}>
          <div class="rail-col" aria-hidden="true">
            <span class="node">{s.state === 'done' ? '✓' : s.index + 1}</span>
          </div>
          <div class="step-card" class:sheet={isNext}>
            <div class="step-head">
              <h2>
                <a href={link.lesson(s.slug)}>{s.title}</a>
              </h2>
              <span class="tag {s.state === 'done' ? 'solid' : s.state === 'started' ? 'shaky' : ''}">{STATE[s.state]}</span>
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
            <div class="step-actions">
              <a class={isNext ? 'primary small' : 'ghost small'} href={link.lesson(s.slug)}>Go</a>
              {#if s.topic}<a class="ghost small" href={link.topic(s.slug)}>Map</a>{/if}
            </div>
          </div>
        </li>
      {/each}
    </ol>
  {:else if feed.roadmaps}
    <div class="empty-state">
      <h2>No such roadmap</h2>
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
    background: var(--sheet-2);
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
    color: var(--graphite);
    background: var(--sheet);
    border: 1.5px dashed var(--unknown);
    border-radius: 50%;
  }

  .started .node {
    color: var(--shaky);
    border: 1.5px solid var(--shaky);
  }

  .done .node {
    color: var(--sheet);
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
    color: var(--ink);
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
    color: var(--graphite);
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

  .step-actions {
    display: flex;
    gap: 6px;
    margin-top: 16px;
  }
</style>
