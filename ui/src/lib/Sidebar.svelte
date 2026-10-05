<script lang="ts">
  // The library pane: roadmaps as folders, steps inside, each step's concepts inside that, then loose topics.
  import { feed } from './feed.svelte.ts';
  import { link, router } from './router.svelte.ts';
  import { countsOf, looseTopics, markOf, outline, placeOf, stepsOf } from './library.ts';
  import type { Topic } from '../../../shared/types.ts';
  import Grip from './Grip.svelte';
  import Logo from './Logo.svelte';

  let { onnavigate }: { onnavigate?: () => void } = $props();

  const OPEN_KEY = 'mind-gym.tree-open';
  let open = $state<Record<string, boolean>>(readOpen());

  function readOpen(): Record<string, boolean> {
    try {
      return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}') as Record<string, boolean>;
    } catch {
      return {};
    }
  }

  function toggle(key: string, value = !isOpen(key)) {
    open = { ...open, [key]: value };
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(open));
    } catch {
      // Not essential.
    }
  }

  /** Roadmaps start open; topics start closed. */
  function isOpen(key: string): boolean {
    return open[key] ?? key.startsWith('r:');
  }

  const route = $derived(router.route);
  const roadmaps = $derived(feed.roadmapList);
  const loose = $derived(looseTopics(feed.topics, roadmaps));
  const live = $derived(Boolean(feed.session && !feed.session.endedAt));
  const currentTopic = $derived(route.page === 'topic' ? route.slug : live ? feed.session?.topicSlug : undefined);

  // Open the way down to whatever is on screen.
  $effect(() => {
    const slug = route.page === 'topic' ? route.slug : undefined;
    if (!slug) return;
    const place = placeOf(slug, roadmaps);
    if (place && !isOpen(`r:${place.roadmap.slug}`)) toggle(`r:${place.roadmap.slug}`, true);
    if (!isOpen(`t:${slug}`)) toggle(`t:${slug}`, true);
  });
</script>

{#snippet chevron(key: string, label: string)}
  <button class="chev" class:open={isOpen(key)} onclick={() => toggle(key)} aria-label="{isOpen(key) ? 'Collapse' : 'Expand'} {label}" aria-expanded={isOpen(key)}>
    <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 2l3 3-3 3" /></svg>
  </button>
{/snippet}

{#snippet topicRow(t: Topic | undefined, slug: string, title: string, number?: number)}
  {@const c = countsOf(t)}
  {@const key = `t:${slug}`}
  <li>
    <div class="row" class:here={currentTopic === slug} class:unstarted={!t}>
      {#if t && t.concepts.length}{@render chevron(key, title)}{:else}<span class="chev-space"></span>{/if}
      <a href={link.topic(slug)} onclick={onnavigate} aria-current={route.page === 'topic' && route.slug === slug && !route.concept ? 'page' : undefined}>
        <span class="name">{number !== undefined ? `${number} · ` : ''}{title}</span>
      </a>
      {#if live && feed.session?.topicSlug === slug}
        <span class="live" title="Lesson in progress"></span>
      {:else if c.total}
        <span class="count">{c.solid}/{c.total}</span>
      {/if}
    </div>
    {#if t && isOpen(key) && t.concepts.length}
      <ul class="concepts">
        {#each outline(t) as concept (concept.id)}
          <li>
            <a
              class="row concept"
              class:focus={t.focus === concept.id}
              href={link.topic(slug, concept.id)}
              onclick={onnavigate}
              data-concept="{slug}/{concept.id}"
              aria-current={route.page === 'topic' && route.slug === slug && route.concept === concept.id ? 'page' : undefined}
            >
              <i class="dot {markOf(concept)}"></i><span class="name">{concept.label}</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}

<div class="files">
  <div class="vault">
    <a class="vault-name" href={link.roadmaps()} onclick={onnavigate}><Logo size={20} class="mark" />aristotle</a>
    <a class="add" href={link.roadmaps()} onclick={onnavigate} title="Plan a roadmap or start a topic" aria-label="Plan a roadmap or start a topic">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" /></svg>
    </a>
  </div>

  <div class="scroll">
    {#if !feed.loaded}
      <p class="note">Loading…</p>
    {:else if roadmaps.length === 0 && loose.length === 0}
      <p class="note">Nothing here yet. Plan a roadmap or start a lesson and it shows up here.</p>
    {/if}

    <ul class="tree">
      {#each roadmaps as r (r.slug)}
        {@const steps = stepsOf(r, feed.topics)}
        {@const key = `r:${r.slug}`}
        <li class="folder">
          <div class="row dir" class:here={route.page === 'roadmap' && route.slug === r.slug}>
            {@render chevron(key, r.title)}
            <a href={link.roadmap(r.slug)} onclick={onnavigate}><span class="name">{r.title}</span></a>
            <span class="count">{steps.filter((s) => s.state === 'done').length}/{steps.length}</span>
          </div>
          {#if isOpen(key)}
            <ul class="steps">
              {#each steps as s (s.index)}
                {@render topicRow(s.topic, s.slug, s.title, s.index + 1)}
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>

    {#if loose.length}
      <p class="sec">Other topics</p>
      <ul class="tree">
        {#each loose as t (t.slug)}
          {@render topicRow(t, t.slug, t.title)}
        {/each}
      </ul>
    {/if}
  </div>
  <Grip name="--files-w" side="right" min={200} max={460} initial={290} label="Resize the library pane" />
</div>

<style>
  .files {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--b1);
    border-right: 1px solid var(--rule);
    font-size: 0.86rem;
  }

  .vault {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 10px 8px 16px;
  }

  .vault a:first-child {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--fg);
    font-weight: 600;
    text-decoration: none;
  }

  .add {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: var(--radius);
    color: var(--faint);
  }

  .add:hover {
    background: var(--hover);
    color: var(--fg);
  }

  .add svg {
    width: 14px;
    height: 14px;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 2px 8px 24px;
  }

  .note {
    margin: 6px 8px;
    color: var(--faint);
    line-height: 1.5;
  }

  .sec {
    margin: 18px 8px 4px;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--faint);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .folder + .folder {
    margin-top: 4px;
  }

  .steps {
    margin-left: 13px;
    padding-left: 4px;
    border-left: 1px solid var(--rule);
  }

  .concepts {
    margin-left: 22px;
    padding-left: 6px;
    border-left: 1px solid var(--rule);
  }

  .row {
    display: flex;
    align-items: flex-start;
    gap: 1px;
    min-height: 27px;
    border-radius: 5px;
  }

  .row > a,
  a.row {
    display: flex;
    flex: 1;
    min-width: 0;
    align-items: baseline;
    gap: 8px;
    padding: 4px 6px;
    color: var(--fg-2);
    text-decoration: none;
    border-radius: 5px;
  }

  .row:hover {
    background: var(--hover);
  }

  .row > a:hover,
  a.row:hover {
    color: var(--fg);
    text-decoration: none;
  }

  .row.dir > a {
    color: var(--fg);
    font-weight: 500;
  }

  .row.here,
  .row:has(> a[aria-current='page']),
  a.row[aria-current='page'] {
    background: var(--acc-soft);
  }

  .row.here > a,
  a.row[aria-current='page'] {
    color: var(--fg);
  }

  .row.unstarted > a {
    color: var(--faint);
  }

  a.row.concept {
    min-height: 25px;
    padding: 3px 6px;
    font-size: 0.83rem;
    align-items: baseline;
  }

  a.row.concept.focus .name {
    color: var(--acc);
  }

  /* Long names wrap onto a second line rather than being cut off at the pane's edge. */
  .name {
    min-width: 0;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .count {
    flex: none;
    padding: 5px 8px 0 4px;
    font-size: 0.74rem;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }

  .live {
    flex: none;
    width: 7px;
    height: 7px;
    margin: 10px 10px 0 4px;
    border-radius: 50%;
    background: var(--acc);
  }

  .chev,
  .chev-space {
    flex: none;
    width: 18px;
    height: 27px;
  }

  .chev {
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--faint);
    cursor: pointer;
  }

  .chev:hover {
    color: var(--fg);
  }

  .chev svg {
    width: 10px;
    height: 10px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 0.15s var(--ease);
  }

  .chev.open svg {
    transform: rotate(90deg);
  }
</style>
