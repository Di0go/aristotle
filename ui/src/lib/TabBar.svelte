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
      <span class="t">{title(key)}</span>
      <button class="x" onclick={(e) => closeTab(e, key)} aria-label="Close {title(key)}" tabindex="-1">×</button>
    </a>
  {/each}
</div>

<style>
  .tabbar {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    min-height: 38px;
    padding: 6px 10px 0;
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
    gap: 6px;
    flex: 0 1 200px;
    min-width: 80px;
    max-width: 220px;
    padding: 6px 6px 7px 12px;
    font-size: 0.82rem;
    color: var(--muted);
    border-radius: 7px 7px 0 0;
    text-decoration: none;
  }

  .tab:hover {
    color: var(--fg);
    background: var(--hover);
    text-decoration: none;
  }

  .tab.on {
    color: var(--fg);
    background: var(--b0);
    box-shadow: 0 0 0 1px var(--rule);
    clip-path: inset(-1px -1px 0 -1px);
  }

  .tab.on::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 1px;
    background: var(--b0);
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
