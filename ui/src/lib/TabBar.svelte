<script lang="ts">
  // The open pages, as tabs above the page. Titles come from the live data, so they follow renames.
  import { feed } from './feed.svelte.ts';
  import { formatDay } from './format.ts';
  import { router } from './router.svelte.ts';
  import { pageKey, routeOf, tabs } from './tabs.svelte.ts';
  import type { Route } from './router.svelte.ts';

  /** A small icon per kind of page, drawn like the ribbon's (20×20, stroked). Related pages share one. */
  const NOTE = 'M4 4.5h12v11H4zM7 8.5h6M7 11.5h4';
  const GRAPH = 'M5 6.5a1.8 1.8 0 1 0 0-.01M15 5.5a1.8 1.8 0 1 0 0-.01M10 15a1.8 1.8 0 1 0 0-.01M6.8 6.3l6.4-.8M6 8.2l3 5.2M14 7.2l-3 5.9';
  const CLOCK = 'M10 3.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M10 6.8V10l2.4 1.8';
  const BOOKS = 'M4 4h3.5v12H4zM8.5 4H12v12H8.5zM13.2 4.6l3.2-.9 3 11.6-3.2.9z';
  const TARGET = 'M10 3.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M10 6.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7';
  const ICONS: Record<Route['page'], string> = {
    now: NOTE,
    lesson: NOTE,
    step: NOTE,
    map: GRAPH,
    topic: GRAPH,
    progress: 'M4.5 16V10M10 16V4.5M15.5 16v-4',
    log: CLOCK,
    session: CLOCK,
    roadmaps: BOOKS,
    topics: BOOKS,
    roadmap: 'M5 16V4M5 4.5h9l-2 3 2 3H5',
    praxis: TARGET,
    mission: TARGET,
  };

  // Read through the router so it updates on every navigation; location itself is not reactive.
  const active = $derived.by(() => {
    void router.route;
    return pageKey(location.hash);
  });

  function title(key: string): string {
    const r = routeOf(key);
    switch (r.page) {
      case 'now':
        return feed.session && !feed.session.endedAt && feed.session.kind !== 'learn' ? feed.session.topic : 'Home';
      case 'progress':
        return 'Progress';
      case 'map':
        return 'Map';
      case 'log':
        return 'Log';
      case 'roadmaps':
      case 'topics':
        return 'Library';
      case 'roadmap':
        return feed.roadmaps?.[r.slug]?.title ?? r.slug;
      case 'topic':
        return feed.topics[r.slug]?.title ?? r.slug;
      case 'lesson':
        return topicTitle(r.slug);
      case 'step':
        return `${topicTitle(r.slug)}: ${r.number ? `step ${r.number}` : 'intro'}`;
      case 'praxis':
        return 'Missions';
      case 'mission':
        return feed.missions?.[r.id]?.title ?? 'Mission';
      case 'session': {
        const date = /^(\d{4}-\d{2}-\d{2})/.exec(r.id)?.[1];
        return `Session${date ? `, ${formatDay(date)}` : ''}`;
      }
    }
  }

  /** A topic's title; for a step not started yet (no topic so far), the step's title on its roadmap. */
  function topicTitle(slug: string): string {
    return feed.topics[slug]?.title ?? feed.roadmapList.flatMap((m) => m.steps).find((s) => s.topic === slug)?.title ?? slug;
  }

  // The × sits inside the tab's link: without this, closing would also follow it.
  function closeTab(e: MouseEvent, key: string) {
    e.preventDefault();
    e.stopPropagation();
    tabs.close(key);
  }

  /** A middle click closes a tab, as in a browser. */
  function onAux(e: MouseEvent, key: string) {
    if (e.button === 1) closeTab(e, key);
  }
</script>

<div class="tabbar" role="tablist" aria-label="Open pages">
  {#each tabs.list as key (key)}
    <a class="tab" class:on={key === active} href={key} role="tab" aria-selected={key === active} onauxclick={(e) => onAux(e, key)}>
      <svg class="i" viewBox="0 0 20 20" aria-hidden="true"><path d={ICONS[routeOf(key).page]} /></svg>
      <span class="t">{title(key)}</span>
      <button class="x" onclick={(e) => closeTab(e, key)} aria-label="Close {title(key)}" tabindex="-1">×</button>
    </a>
  {/each}
</div>

<style>
  /* Tabs sized to their titles, an icon for the kind of page, hairline separators between the quiet ones,
     and the open page lifted onto the page's own ground with an accent line on top. */
  .tabbar {
    display: flex;
    align-items: flex-end;
    min-height: 40px;
    padding: 0 8px;
    background: var(--b1);
    border-bottom: 1px solid var(--rule);
    overflow-x: auto;
    overflow-y: visible;
    scrollbar-width: none;
  }

  .tab {
    position: relative;
    display: flex;
    align-items: center;
    gap: 7px;
    flex: 0 1 auto;
    min-width: 0;
    max-width: 230px;
    height: 34px;
    margin-top: 6px;
    padding: 0 6px 0 12px;
    font-size: 0.8rem;
    color: var(--muted);
    border-radius: 8px 8px 0 0;
    text-decoration: none;
    transition:
      background-color 0.12s,
      color 0.12s;
  }

  /* A hairline between two quiet tabs; none next to the open one or under the pointer. */
  .tab + .tab::before {
    content: '';
    position: absolute;
    left: -1px;
    top: 9px;
    bottom: 9px;
    border-left: 1px solid var(--rule-strong);
  }

  .tab.on::before,
  .tab.on + .tab::before,
  .tab:hover::before,
  .tab:hover + .tab::before {
    display: none;
  }

  .tab:hover {
    color: var(--fg);
    background: var(--hover);
    text-decoration: none;
  }

  /* The open tab: on the page's own ground, with the accent line on top (stopping short of the rounded corners). */
  .tab.on {
    color: var(--fg);
    font-weight: 500;
    background: var(--b0);
    background-image: linear-gradient(var(--acc), var(--acc));
    background-size: calc(100% - 16px) 2px;
    background-position: 8px 0;
    background-repeat: no-repeat;
    box-shadow: 0 0 0 1px var(--rule);
    clip-path: inset(-1px -1px 0 -1px);
  }

  /* The open tab runs into the page below it: a strip of the page's ground covers the bar's bottom border. */
  .tab.on::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 1px;
    background: var(--b0);
  }

  .tab.on .i {
    color: var(--acc);
  }

  .i {
    flex: none;
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.9;
  }

  .t {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .x {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--faint);
    font-size: 0.95rem;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
  }

  .tab:hover .x,
  .tab.on .x {
    opacity: 1;
  }

  /* Red on hover: closing is the one thing this button does. */
  .x:hover,
  .x:focus-visible {
    background: color-mix(in srgb, var(--wrong) 14%, transparent);
    color: var(--wrong);
    outline: none;
  }

  @media (max-width: 960px) {
    .tabbar {
      display: none;
    }
  }
</style>
