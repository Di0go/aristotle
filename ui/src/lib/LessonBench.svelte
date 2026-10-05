<script lang="ts">
  // The right sidebar beside a lesson: where it sits on the roadmap, the concept being taught, the plan as
  // an outline, and the local graph around the concept. The answer to "what are we doing, and why now?".
  import { feed } from './feed.svelte.ts';
  import { countsOf, markOf, outline, placeOf, splitRef, stepsOf } from './library.ts';
  import { link } from './router.svelte.ts';
  import LocalGraph from './LocalGraph.svelte';
  import StatusBar from './StatusBar.svelte';
  import type { Topic } from '../../../shared/types.ts';

  let { topic, onclose }: { topic: Topic; onclose?: () => void } = $props();

  const place = $derived(placeOf(topic.slug, feed.roadmapList));
  const steps = $derived(place ? stepsOf(place.roadmap, feed.topics) : []);
  const concepts = $derived(outline(topic));
  const counts = $derived(countsOf(topic));
  const focus = $derived(topic.concepts.find((c) => c.id === topic.focus) ?? null);
  const byId = $derived(new Map(topic.concepts.map((c) => [c.id, c])));

  /** A prerequisite as "topic/id": bare ids are in this topic, borrowed ones already say where they are from. */
  function qualified(dep: string): string {
    return dep.includes('/') ? dep : `${topic.slug}/${dep}`;
  }

  function depHref(dep: string): string {
    const { topic: slug = topic.slug, concept: id } = splitRef(dep);
    return link.topic(slug, id);
  }
</script>

<div class="bench-inner">
  {#if onclose}
    <button class="close bench-close" onclick={onclose} aria-label="Close">×</button>
  {/if}

  {#if focus}
    <section class="bench-section">
      <h3 class="bench-title">Working on now</h3>
      <p class="now-label"><a href={link.topic(topic.slug, focus.id)} data-concept="{topic.slug}/{focus.id}">{focus.label}</a></p>
      {#if focus.summary}<p class="now-summary">{focus.summary}</p>{/if}
      {#if focus.deps.length}
        <p class="now-deps">
          Builds on
          {#each focus.deps as d, i (d)}
            {@const dep = byId.get(d)}
            {#if i}{', '}{/if}<a href={depHref(d)} data-concept={qualified(d)}>{dep?.label ?? d.split('/').at(-1)}</a>
          {/each}
        </p>
      {/if}
    </section>
    <section class="bench-section">
      <h3 class="bench-title">Local graph</h3>
      <div class="graph-box"><LocalGraph {topic} focus={focus.id} others={feed.topics} /></div>
    </section>
  {/if}

  {#if concepts.length}
    <section class="bench-section">
      <div class="bench-row">
        <h3 class="bench-title">Outline</h3>
        <span class="bench-count">{counts.solid}/{counts.total} solid</span>
      </div>
      <ol class="plan">
        {#each concepts as c (c.id)}
          <li class:focus={c.id === topic.focus} class:goal={c.goal}>
            <a href={link.topic(topic.slug, c.id)} data-concept="{topic.slug}/{c.id}">
              <i class="dot {markOf(c)}"></i>
              <span>{c.label}</span>
            </a>
          </li>
        {/each}
      </ol>
      <StatusBar {counts} fading={counts.fading} />
    </section>
  {/if}

  {#if place}
    <section class="bench-section">
      <h3 class="bench-title"><a href={link.roadmap(place.roadmap.slug)}>{place.roadmap.title}</a></h3>
      <ol class="route">
        {#each steps as s (s.index)}
          <li class="route-step {s.state}" class:here={s.index === place.index}>
            <i class="dot {s.state}"></i>
            <a href={link.topic(s.slug)}>{s.title}</a>
          </li>
        {/each}
      </ol>
    </section>
  {/if}

  <section class="bench-section">
    <h3 class="bench-title">What this topic is for</h3>
    <p class="bench-goal">{topic.goal}</p>
  </section>
</div>
