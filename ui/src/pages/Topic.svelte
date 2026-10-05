<script lang="ts">
  // A class's concepts: what it teaches, as an outline and a graph, with the panel for one concept. The class itself
  // (its steps, where he is, what to do next) is the class page; this is reached from its "what you'll understand".
  import { feed } from '../lib/feed.svelte.ts';
  import { ago } from '../lib/format.ts';
  import { countsOf, markOf, outline, placeOf } from '../lib/library.ts';
  import { link } from '../lib/router.svelte.ts';
  import ConceptPanel from '../lib/ConceptPanel.svelte';
  import MapGraph from '../lib/MapGraph.svelte';
  import StatusBar from '../lib/StatusBar.svelte';

  let { slug, concept = undefined }: { slug: string; concept?: string } = $props();

  let missing = $state(false);
  let selected = $state<string | null>(null);

  const topic = $derived(feed.topics[slug] ?? null);
  const counts = $derived(countsOf(topic ?? undefined));
  const place = $derived(placeOf(slug, feed.roadmapList));
  const step = $derived(place ? place.roadmap.steps[place.index] : null);
  const chosen = $derived(topic?.concepts.find((c) => c.id === selected) ?? null);
  const ordered = $derived(topic ? outline(topic) : []);

  $effect(() => {
    selected = concept ?? null;
  });

  $effect(() => {
    missing = false;
    // Once loaded, the feed holds every topic, so one it doesn't have doesn't exist (yet).
    if (feed.loaded && !feed.topics[slug]) missing = true;
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
</script>

<div class="page topic-page">
  {#if topic}
    <header class="page-head">
      <nav class="crumbs" aria-label="Where this is">
        {#if place}<a href={link.roadmap(place.roadmap.slug)}>{place.roadmap.title}</a><span class="sep">/</span>{/if}
        <a href={link.lesson(slug)}>{topic.title}</a>
        <span class="sep">/</span>
        <span>Concepts</span>
      </nav>
      <h1 class="page-title">{topic.title}: concepts</h1>
      <p class="page-lede">
        What this class teaches. {counts.solid} of {counts.total} solid; point at one to see what it builds on, click it for its record.
      </p>
    </header>

    <!-- The outline beside the map -->
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
    <!-- A class not begun has no concepts yet: its page says so and offers to begin. -->
    <div class="empty-state">
      <p>{step.title} hasn't begun, so it has no concepts yet.</p>
      <p><a href={link.lesson(slug)}>Go to the class</a></p>
    </div>
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
