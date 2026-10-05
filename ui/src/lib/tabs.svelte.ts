// Open pages, as tabs. Every page you visit gets a tab (one per page, whatever concept is selected on it);
// the oldest falls off past eight. Remembered in this browser only.

import { type Route, router } from './router.svelte.ts';
import { migrateKey } from './storage.ts';

const KEY = 'aristotle.tabs';
/** The name it had before the app was renamed, moved over on first read. */
const OLD_KEY = 'mind-gym.tabs';
const MAX = 8;

/** One tab per page: a topic is one tab whichever concept is selected in it. */
export function pageKey(hash: string): string {
  return (hash || '#/').split('?')[0];
}

/** Parses a tab's hash with the router's own rules. */
export function routeOf(key: string): Route {
  return router.parse(key);
}

class Tabs {
  list = $state<string[]>(read());

  constructor() {
    this.visit(location.hash);
    addEventListener('hashchange', () => this.visit(location.hash));
  }

  /** Closes a tab. Closing the open one moves to its left neighbour (the right one if it was first, Now if none is left). */
  close(key: string) {
    const i = this.list.indexOf(key);
    if (i === -1) return;
    const wasActive = key === pageKey(location.hash);
    this.list = this.list.filter((k) => k !== key);
    this.save();
    if (wasActive) location.hash = this.list[Math.max(0, i - 1)] ?? '#/';
  }

  private visit(hash: string) {
    const key = pageKey(hash);
    if (!this.list.includes(key)) {
      this.list = [...this.list, key].slice(-MAX);
      this.save();
    }
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.list));
    } catch {
      // Not essential.
    }
  }
}

export const tabs = new Tabs();

function read(): string[] {
  try {
    migrateKey(OLD_KEY, KEY);
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}
