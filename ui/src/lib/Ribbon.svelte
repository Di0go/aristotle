<script lang="ts">
  // The thin strip on the far left: the core's ribbon (@organon/core/ui/Ribbon.svelte: search, focus, the look) with
  // Aristotle's places (Home, Review with today's share of what is fading, Courses, the map), You after search, and
  // Settings (who teaches) at the foot.
  import type { Place } from '@organon/core/ui/Ribbon.svelte';
  import CoreRibbon from '@organon/core/ui/Ribbon.svelte';
  import { tutor } from './tutor.svelte.ts';
  import { feed } from './feed.svelte.ts';
  import { link, router } from './router.svelte.ts';
  import { theme } from './theme.svelte.ts';
  import { reviewsToday } from '../../../shared/types.ts';

  /** The places, each with its icon (20×20, stroked) and its name under it. Everything else is reached from them. */
  const HOME = 'M4 4.5h12v11H4zM7 8.5h6M7 11.5h4';
  const YOU = 'M10 4a3 3 0 1 0 0 6a3 3 0 1 0 0-6M4.5 16.5c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5';
  // Drawn 1.2 to the left of its box, as it always was (it leans right).
  const COURSES = 'M2.8 4h3.5v12H2.8zM7.3 4H10.8v12H7.3zM12 4.6l3.2-.9 3 11.6-3.2.9z';
  const MAP = 'M5 6.5a1.8 1.8 0 1 0 0-.01M15 5.5a1.8 1.8 0 1 0 0-.01M10 15a1.8 1.8 0 1 0 0-.01M6.8 6.3l6.4-.8M6 8.2l3 5.2M14 7.2l-3 5.9';
  const REVIEW = 'M15.5 8A5.8 5.8 0 0 0 4.7 7.2M4.5 4.5v2.9h2.9M4.5 12a5.8 5.8 0 0 0 10.8.8M15.5 15.5v-2.9h-2.9';
  const SETTINGS = 'M4 6.5h6M14 6.5h2M4 13.5h2M10 13.5h6M12 4.5v4M8 11.5v4';

  const route = $derived(router.route);
  /** Which place is lit: the map for the map and a class's concepts; Home for Home and what it leads to. */
  const section = $derived(
    route.page === 'review' || route.page === 'train'
      ? 'review'
      : route.page === 'map' || route.page === 'topic'
        ? 'map'
        : ['roadmaps', 'roadmap', 'topics'].includes(route.page)
          ? 'courses'
          : ['now', 'progress', 'log', 'session', 'praxis', 'mission'].includes(route.page)
            ? 'now'
            : '',
  );
  /** A lesson going on (Home points to it); a review going on, or waiting for an answer (Review lights up). */
  const live = $derived(feed.session?.kind === 'learn' && feed.liveSlug !== null && feed.inProgress);
  const reviewOpen = $derived(feed.session?.kind === 'review' && !feed.session.endedAt);
  /** Today's share of the concepts fading across every class (the day's reviews are capped). */
  const fading = $derived(reviewsToday(Object.values(feed.topics).flatMap((t) => t.concepts)));

  const places = $derived<Place[]>([
    {
      id: 'now',
      label: 'Home',
      href: link.now(),
      icon: HOME,
      on: section === 'now',
      pip: feed.pending && feed.session?.kind === 'learn' ? 'turn' : live ? 'dot' : undefined,
      pipTitle: feed.pending && feed.session?.kind === 'learn' ? 'Your turn' : undefined,
    },
    {
      id: 'review',
      label: 'Review',
      href: link.review(),
      icon: REVIEW,
      on: section === 'review',
      pip: reviewOpen && feed.pending ? 'turn' : undefined,
      pipTitle: reviewOpen && feed.pending ? 'Your turn' : undefined,
      count: fading,
      countTitle: `${fading} to review today`,
    },
    { id: 'courses', label: 'Courses', href: link.roadmaps(), icon: COURSES, on: section === 'courses' },
    { id: 'map', label: 'Map', href: link.map(), icon: MAP, on: section === 'map' },
  ]);
</script>

<CoreRibbon {places} look={theme}>
  {#snippet after()}
    <a class="rib" class:on={route.page === 'about'} href={link.about()} aria-current={route.page === 'about' ? 'page' : undefined}>
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d={YOU} /></svg>
      <span class="lbl">You</span>
    </a>
  {/snippet}
  {#snippet foot()}
    <a
      class="rib"
      class:on={route.page === 'settings'}
      href={link.settings()}
      title="Who teaches: Claude Code, another agent, or a model API"
    >
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d={SETTINGS} /></svg>
      <span class="lbl">Settings</span>
      {#if tutor.problem}<i class="pip turn" title={tutor.problem}></i>{/if}
    </a>
  {/snippet}
</CoreRibbon>
