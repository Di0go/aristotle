<script lang="ts">
  // The open pages, as tabs above the page: the core's tab bar (@organon/core/ui/TabBar.svelte) with Aristotle's titles
  // and icons. Titles come from the live data, so they follow renames.
  import CoreTabBar from '@organon/core/ui/TabBar.svelte';
  import { feed } from './feed.svelte.ts';
  import { formatDay } from './format.ts';
  import { routeOf, tabs } from './tabs.svelte.ts';
  import type { Route } from './router.svelte.ts';

  /** A small icon per kind of page, drawn like the ribbon's (20×20, stroked). Related pages share one. */
  const NOTE = 'M4 4.5h12v11H4zM7 8.5h6M7 11.5h4';
  const GRAPH = 'M5 6.5a1.8 1.8 0 1 0 0-.01M15 5.5a1.8 1.8 0 1 0 0-.01M10 15a1.8 1.8 0 1 0 0-.01M6.8 6.3l6.4-.8M6 8.2l3 5.2M14 7.2l-3 5.9';
  const CLOCK = 'M10 3.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M10 6.8V10l2.4 1.8';
  const BOOKS = 'M4 4h3.5v12H4zM8.5 4H12v12H8.5zM13.2 4.6l3.2-.9 3 11.6-3.2.9z';
  const TARGET = 'M10 3.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M10 6.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7';
  /** Two arrows turning back on themselves: recall, again and again. */
  const REVIEW = 'M15.5 8A5.8 5.8 0 0 0 4.7 7.2M4.5 4.5v2.9h2.9M4.5 12a5.8 5.8 0 0 0 10.8.8M15.5 15.5v-2.9h-2.9';
  const ICONS: Record<Route['page'], string> = {
    now: NOTE,
    review: REVIEW,
    train: REVIEW,
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
    about: 'M10 4a3 3 0 1 0 0 6a3 3 0 1 0 0-6M4.5 16.5c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5',
    settings: 'M4 6.5h6M14 6.5h2M4 13.5h2M10 13.5h6M12 4.5v4M8 11.5v4',
  };

  function title(key: string): string {
    const r = routeOf(key);
    switch (r.page) {
      case 'now':
        return 'Home';
      case 'review':
        return 'Review';
      case 'train':
        return `Training: ${topicTitle(r.slug)}`;
      case 'progress':
        return 'Progress';
      case 'map':
        return 'Map';
      case 'log':
        return 'Log';
      case 'roadmaps':
      case 'topics':
        return 'Courses';
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
      case 'about':
        return 'About you';
      case 'settings':
        return 'Settings';
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
</script>

<CoreTabBar {tabs} {title} icon={(key: string) => ICONS[routeOf(key).page]} />
