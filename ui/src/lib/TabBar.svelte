<script lang="ts">
  // The open pages, as tabs above the page. Titles come from the live data, so they follow renames.
  import { feed } from './feed.svelte.ts';
  import { tabs, pageKey, routeOf } from './tabs.svelte.ts';
  import { router } from './router.svelte.ts';
  import { formatDay } from './format.ts';

  const active = $derived.by(() => {
    void router.route;
    return pageKey(location.hash);
  });

  function title(key: string): string {
    const r = routeOf(key);
    switch (r.page) {
      case 'now':
        return feed.session && !feed.session.endedAt ? feed.session.topic : 'Now';
      case 'progress':
        return 'Progress';
      case 'map':
        return 'Map';
      case 'log':
        return 'Log';
      case 'roadmaps':
        return 'Library';
      case 'topics':
        return 'Library';
      case 'roadmap':
        return feed.roadmaps?.[r.slug]?.title ?? r.slug;
      case 'topic':
        return feed.topics[r.slug]?.title ?? r.slug;
      case 'lesson':
        return `${feed.topics[r.slug]?.title ?? feed.roadmapList.flatMap((m) => m.steps).find((s) => s.topic === r.slug)?.title ?? r.slug}: class`;
      case 'praxis':
        return 'Praxis';
      case 'mission':
        return feed.missions?.[r.id]?.title ?? 'Mission';
      case 'session': {
        const date = /^(\d{4}-\d{2}-\d{2})/.exec(r.id)?.[1];
        return `Session${date ? `, ${formatDay(date)}` : ''}`;
      }
    }
  }

  /** A small icon per kind of page, drawn like the ribbon's (20×20, stroked). */
  const ICONS: Record<string, string> = {
    now: 'M4 4.5h12v11H4zM7 8.5h6M7 11.5h4',
    lesson: 'M4 4.5h12v11H4zM7 8.5h6M7 11.5h4',
    map: 'M5 6.5a1.8 1.8 0 1 0 0-.01M15 5.5a1.8 1.8 0 1 0 0-.01M10 15a1.8 1.8 0 1 0 0-.01M6.8 6.3l6.4-.8M6 8.2l3 5.2M14 7.2l-3 5.9',
    topic: 'M5 6.5a1.8 1.8 0 1 0 0-.01M15 5.5a1.8 1.8 0 1 0 0-.01M10 15a1.8 1.8 0 1 0 0-.01M6.8 6.3l6.4-.8M6 8.2l3 5.2M14 7.2l-3 5.9',
    progress: 'M4.5 16V10M10 16V4.5M15.5 16v-4',
    log: 'M10 3.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M10 6.8V10l2.4 1.8',
    session: 'M10 3.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M10 6.8V10l2.4 1.8',
    roadmaps: 'M4 4h3.5v12H4zM8.5 4H12v12H8.5zM13.2 4.6l3.2-.9 3 11.6-3.2.9z',
    topics: 'M4 4h3.5v12H4zM8.5 4H12v12H8.5zM13.2 4.6l3.2-.9 3 11.6-3.2.9z',
    roadmap: 'M5 16V4M5 4.5h9l-2 3 2 3H5',
    praxis: 'M10 3.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M10 6.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7',
    mission: 'M10 3.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M10 6.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7',
  };

  function closeTab(e: MouseEvent, key: string) {
    e.preventDefault();
    e.stopPropagation();
    tabs.close(key);
  }

  function onAux(e: MouseEvent, key: string) {
    if (e.button === 1) closeTab(e, key);
  }
</script>

<div class="tabbar" role="tablist" aria-label="Open pages">
  {#each tabs.list as key (key)}
    <a class="tab" class:on={key === active} href={key} role="tab" aria-selected={key === active} onauxclick={(e) => onAux(e, key)}>
      <svg class="i" viewBox="0 0 20 20" aria-hidden="true"><path d={ICONS[routeOf(key).page] ?? ICONS.now} /></svg>
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
    transition: background-color 0.12s, color 0.12s;
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

  .tab.on {
    color: var(--fg);
    font-weight: 500;
    background: var(--b0);
    box-shadow: 0 0 0 1px var(--rule);
    clip-path: inset(-1px -1px 0 -1px);
  }

  /* The accent line on top, and the open tab running into the page below it. */
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

  .tab.on {
    background-image: linear-gradient(var(--acc), var(--acc));
    background-size: calc(100% - 16px) 2px;
    background-position: 8px 0;
    background-repeat: no-repeat;
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

  .x:hover {
    background: var(--b2);
    color: var(--fg);
  }

  @media (max-width: 960px) {
    .tabbar {
      display: none;
    }
  }
</style>
