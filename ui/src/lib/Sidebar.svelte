<script lang="ts">
  // The library pane: roadmaps as folders, steps inside, and in each step's topic two folders: its Class (every
  // step taught, numbered across sessions, with how its checks went) and its Concepts. Then loose topics.
  import { classes, type ClassStep } from './classes.svelte.ts';
  import { feed } from './feed.svelte.ts';
  import { countsOf, looseTopics, markOf, outline, placeOf, stepsOf } from './library.ts';
  import { link, router } from './router.svelte.ts';
  import { migrateKey } from './storage.ts';
  import Grip from './Grip.svelte';
  import Logo from './Logo.svelte';
  import type { Topic } from '../../../shared/types.ts';

  const OPEN_KEY = 'aristotle.tree-open';
  /** The name it had before the app was renamed, moved over on first read. */
  const OLD_OPEN_KEY = 'mind-gym.tree-open';

  let { onnavigate }: { onnavigate?: () => void } = $props();

  /**
   * Which folders are open, by key: "r:<roadmap>", "t:<topic>", and inside a topic "c:<topic>" (its class) and
   * "k:<topic>" (its concepts). Only the ones he has toggled are stored.
   */
  let open = $state<Record<string, boolean>>(readOpen());

  const route = $derived(router.route);
  const roadmaps = $derived(feed.roadmapList);
  const loose = $derived(looseTopics(feed.topics, roadmaps));
  const currentTopic = $derived(route.page === 'topic' || route.page === 'lesson' ? route.slug : (feed.liveSlug ?? undefined));

  // Open the way down to whatever is on screen.
  $effect(() => {
    const slug = route.page === 'topic' || route.page === 'lesson' ? route.slug : undefined;
    if (!slug) return;
    const place = placeOf(slug, roadmaps);
    if (place && !isOpen(`r:${place.roadmap.slug}`)) toggle(`r:${place.roadmap.slug}`, true);
    if (!isOpen(`t:${slug}`)) toggle(`t:${slug}`, true);
    if (route.page === 'topic' && route.concept && !isOpen(`k:${slug}`)) toggle(`k:${slug}`, true);
  });

  function readOpen(): Record<string, boolean> {
    try {
      migrateKey(OLD_OPEN_KEY, OPEN_KEY);
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

  /** Roadmaps and a topic's class start open; topics and their concepts start closed. */
  function isOpen(key: string): boolean {
    return open[key] ?? (key.startsWith('r:') || key.startsWith('c:'));
  }

  /** aria-current for a topic's map (no concept given) or one of its concepts: "page" when it is what is on screen. */
  function current(slug: string, concept?: string): 'page' | undefined {
    if (route.page !== 'topic' || route.slug !== slug) return undefined;
    return (concept ? route.concept === concept : !route.concept) ? 'page' : undefined;
  }

  /** aria-current for a topic's class row (no part given) or one of its steps. */
  function currentClass(slug: string, part?: string): 'page' | undefined {
    if (route.page !== 'lesson' || route.slug !== slug) return undefined;
    return (part ? route.part === part : !route.part) ? 'page' : undefined;
  }

  /** How a step's checks went, in a few characters: right out of graded, written, or what is left to answer. */
  function tally(s: ClassStep): { text: string; tone: '' | 'all' | 'todo' } {
    const c = s.checks;
    const graded = c.right + c.wrong + c.dontKnow;
    if (c.unanswered) return { text: 'to answer', tone: 'todo' };
    if (graded) return { text: `${c.right}/${graded}`, tone: c.right === graded ? 'all' : '' };
    if (c.written) return { text: '✓', tone: 'all' };
    return { text: '', tone: '' };
  }
</script>

{#snippet chevron(key: string, label: string)}
  <button
    class="chev"
    class:open={isOpen(key)}
    onclick={() => toggle(key)}
    aria-label="{isOpen(key) ? 'Collapse' : 'Expand'} {label}"
    aria-expanded={isOpen(key)}
  >
    <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 2l3 3-3 3" /></svg>
  </button>
{/snippet}

{#snippet topicRow(t: Topic | undefined, slug: string, title: string, number?: number)}
  {@const c = countsOf(t)}
  {@const key = `t:${slug}`}
  <li>
    <div class="row" class:here={currentTopic === slug} class:unstarted={!t}>
      {#if t}{@render chevron(key, title)}{:else}<span class="chev-space"></span>{/if}
      <a href={link.lesson(slug)} onclick={onnavigate} aria-current={currentClass(slug)}>
        <span class="name">{number !== undefined ? `${number} · ` : ''}{title}</span>
      </a>
      {#if feed.liveSlug === slug}
        <span class="live" title="Lesson in progress"></span>
      {:else if c.total}
        <span class="count">{c.solid}/{c.total}</span>
      {/if}
    </div>
    {#if t && isOpen(key)}
      {@const steps = isOpen(`c:${slug}`) ? classes.steps(slug) : null}
      <ul class="sub">
        <li>
          <div class="row sub-dir">
            {@render chevron(`c:${slug}`, `the class of ${title}`)}
            <a href={link.lesson(slug)} onclick={onnavigate}><span class="name">Class</span></a>
          </div>
          {#if isOpen(`c:${slug}`)}
            <ul class="leaves">
              {#if steps === null}
                <li class="leaf-note">Loading…</li>
              {:else if steps.length === 0}
                <li class="leaf-note">No steps yet</li>
              {/if}
              {#each steps ?? [] as s (s.key)}
                {@const m = tally(s)}
                {@const now = s.live && s === steps?.at(-1)}
                <li>
                  <a class="row leaf" href={link.lesson(slug, s.key)} onclick={onnavigate} aria-current={currentClass(slug, s.key)}>
                    <span class="num">{s.number}</span><span class="name">{s.title ?? `Step ${s.number}`}</span>
                    {#if now}<span class="live" title="Being taught now"></span>{:else if m.text}<span class="mark {m.tone}">{m.text}</span
                      >{/if}
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        </li>
        {#if t.concepts.length}
          <li>
            <div class="row sub-dir">
              {@render chevron(`k:${slug}`, `the concepts of ${title}`)}
              <a href={link.topic(slug)} onclick={onnavigate} aria-current={current(slug)}><span class="name">Concepts</span></a>
              <span class="count">{c.solid}/{c.total}</span>
            </div>
            {#if isOpen(`k:${slug}`)}
              <ul class="leaves">
                {#each outline(t) as concept (concept.id)}
                  <li>
                    <a
                      class="row leaf concept"
                      class:focus={t.focus === concept.id}
                      href={link.topic(slug, concept.id)}
                      onclick={onnavigate}
                      data-concept="{slug}/{concept.id}"
                      aria-current={current(slug, concept.id)}
                    >
                      <i class="dot {markOf(concept)}"></i><span class="name">{concept.label}</span>
                    </a>
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {/if}
      </ul>
    {/if}
  </li>
{/snippet}

<div class="files">
  <div class="vault">
    <a class="vault-name" href={link.roadmaps()} onclick={onnavigate}><Logo size={20} class="mark" />aristotle</a>
    <a
      class="add"
      href={link.roadmaps()}
      onclick={onnavigate}
      title="Plan a roadmap or start a topic"
      aria-label="Plan a roadmap or start a topic"
    >
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

  .sub {
    margin-left: 22px;
    padding-left: 2px;
    border-left: 1px solid var(--rule);
  }

  .leaves {
    margin-left: 22px;
    padding-left: 6px;
    border-left: 1px solid var(--rule);
  }

  .row.sub-dir > a {
    padding: 3px 6px;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--muted);
  }

  .leaf-note {
    padding: 3px 6px;
    font-size: 0.8rem;
    color: var(--faint);
  }

  .num {
    flex: none;
    min-width: 1.1em;
    font-size: 0.74rem;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }

  .mark {
    flex: none;
    margin-left: auto;
    font-size: 0.72rem;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }

  .mark.all {
    color: var(--solid);
  }

  .mark.todo {
    color: var(--acc);
  }

  .leaf .live {
    margin: 0 4px 0 auto;
    align-self: center;
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

  a.row.leaf {
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
