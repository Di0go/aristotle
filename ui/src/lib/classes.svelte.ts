// Each topic's class as an outline of its steps, for the library tree: past sessions loaded on first use and
// kept, the live session read from the feed as it grows. Also carries a request to show one part of a class,
// which the class page (and the class so far above a live lesson) opens and scrolls to.

import { feed, topicSessions } from './feed.svelte.ts';
import { sectionsOf, stepsIn, type Section } from './sections.ts';
import type { PublicItem, Session } from '../../../shared/types.ts';

export interface ClassStep {
  /** The section's key: the id of the item that opens it. */
  key: string;
  number: number;
  title?: string;
  checks: Section['checks'];
  /** Taught in the session running now. */
  live: boolean;
}

type Record_ = { session: Session; items: PublicItem[] };

class Classes {
  /** Finished sessions by topic, oldest first. */
  private past = $state<Record<string, Record_[]>>({});
  private loading = new Set<string>();
  /** A part of a class to open and scroll to (from the tree), taken by whoever shows it. */
  reveal = $state<string | null>(null);

  /** The topic's steps in order, numbered across the class; loads its past sessions the first time. */
  steps(slug: string): ClassStep[] | null {
    const past = this.past[slug];
    if (!past) {
      void this.load(slug);
      return null;
    }
    const live = feed.liveSlug === slug && feed.session ? feed.session : null;
    // A session on this topic that has just ended is in neither list yet: load the class again.
    const session = feed.session;
    if (session?.topicSlug === slug && !live && !past.some((r) => r.session.id === session.id)) {
      queueMicrotask(() => {
        this.refresh(slug);
        void this.load(slug);
      });
    }
    const out: ClassStep[] = [];
    let before = 0;
    for (const r of past) {
      if (r.session.id === live?.id) continue;
      out.push(...toSteps(sectionsOf(r.items, before), false));
      before += stepsIn(r.items);
    }
    if (live) out.push(...toSteps(sectionsOf(feed.items, before), true));
    return out;
  }

  /** Forgets a topic's sessions, so they load again (a session on it ended). */
  refresh(slug: string) {
    delete this.past[slug];
  }

  private async load(slug: string) {
    if (this.loading.has(slug)) return;
    this.loading.add(slug);
    try {
      const all = (await topicSessions(slug)).reverse();
      const records = await Promise.all(
        all.map(async (s) => (await (await fetch(`/api/sessions/${encodeURIComponent(s.id)}`)).json()) as Record_),
      );
      this.past[slug] = records.filter((r) => r.session);
    } finally {
      this.loading.delete(slug);
    }
  }
}

function toSteps(sections: Section[], live: boolean): ClassStep[] {
  return sections
    .filter((s) => s.kind === 'step')
    .map((s) => ({ key: s.key, number: s.step ?? 0, title: s.title, checks: s.checks, live }));
}

export const classes = new Classes();
