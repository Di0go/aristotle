// Open pages, as tabs: the core's (@organon/core/ui/tabs), every page visited gets a tab (one per page, whatever
// concept is selected on it), except a class, which has one tab whichever of its pages is open (moving between steps
// moves that tab along); the oldest falls off past eight. Remembered in this browser only, under Aristotle's key (the
// Mind Gym's old one moved over).

import { createTabs, pageKey } from '@organon/core/ui/tabs';
import { type Route, router } from './router.svelte.ts';

export { pageKey };

/** The topic whose class a tab shows (its page or one of its steps), if it shows one. */
function classOf(key: string): string | undefined {
  const r = router.parse(key);
  return r.page === 'lesson' || r.page === 'step' ? r.slug : undefined;
}

export const tabs = createTabs({ key: 'aristotle.tabs', group: classOf, legacyKeys: ['mind-gym.tabs'] });

/** Parses a tab's hash with the router's own rules. */
export function routeOf(key: string): Route {
  return router.parse(key);
}
