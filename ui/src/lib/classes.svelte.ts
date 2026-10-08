// Each topic's class as pages (steps.ts), for the library tree, the class page and its step pages: past sessions
// loaded on first use and kept, the session running now read from the live feed as it grows.

import { feed, topicSessions } from './feed.svelte.ts';
import { link } from './router.svelte.ts';
import { pagesOf, type ClassPage, type SessionRecord } from './steps.ts';

class Classes {
  /** Finished sessions by topic, oldest first. */
  private past = $state<Record<string, SessionRecord[]>>({});
  private loading = new Set<string>();

  /** The topic's class, page by page; null while its sessions load for the first time. */
  pages(slug: string): ClassPage[] | null {
    const past = this.past[slug];
    if (!past) {
      void this.load(slug);
      return null;
    }
    const session = feed.session;
    const live = feed.liveSlug === slug && session ? session : null;
    // A session on this topic that has just ended is in neither list yet: load the class again.
    if (session?.topicSlug === slug && !live && !past.some((r) => r.session.id === session.id)) {
      queueMicrotask(() => {
        delete this.past[slug];
        void this.load(slug);
      });
    }
    // The current session as the feed has it, in its place (one picked up again is older than others on the topic,
    // and its record here may be from before it was).
    const current = session?.topicSlug === slug ? session : null;
    const records = past.map((r) => (r.session.id === current?.id ? { session: current, items: feed.items } : r));
    if (live && !past.some((r) => r.session.id === live.id)) records.push({ session: live, items: feed.items });
    return pagesOf(records, live?.id);
  }

  /** The page being taught right now, if a lesson is live: where "your turn" and Home lead. */
  liveHref(): string | null {
    const slug = feed.session?.kind === 'learn' ? feed.liveSlug : null;
    if (!slug) return null;
    const last = this.pages(slug)?.at(-1);
    return last ? link.step(slug, last.number) : link.lesson(slug);
  }

  /** Where the open sitting is, whatever its kind: the step being taught, Review, or the training set's page. */
  sittingHref(): string | null {
    const s = feed.session;
    if (!s || s.endedAt) return null;
    if (s.kind === 'review') return link.review();
    if (s.kind === 'train') return link.train(s.topicSlug);
    return this.liveHref();
  }

  private async load(slug: string) {
    if (this.loading.has(slug)) return;
    this.loading.add(slug);
    try {
      const all = (await topicSessions(slug)).reverse();
      const records = await Promise.all(
        all.map(async (s) => (await (await fetch(`/api/sessions/${encodeURIComponent(s.id)}`)).json()) as SessionRecord),
      );
      this.past[slug] = records.filter((r) => r.session);
    } finally {
      this.loading.delete(slug);
    }
  }
}

export const classes = new Classes();
