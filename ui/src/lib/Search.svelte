<script lang="ts">
  // The search palette: the core's (@organon/core/ui/Search.svelte: Ctrl+K or / anywhere, arrows, Enter, Escape, the
  // words typed marked) over everything he has (roadmaps, steps, topics, concepts, missions, and what was said in every
  // session), searched on the server as he types.
  import CoreSearch, { type SearchHit as CoreHit } from '@organon/core/ui/Search.svelte';
  import { link } from './router.svelte.ts';
  import type { SearchHit, SearchKind } from '../../../shared/types.ts';

  const KIND: Record<SearchKind, string> = {
    roadmap: 'Course',
    step: 'Class',
    topic: 'Class',
    concept: 'Concept',
    mission: 'Mission',
    session: 'Session',
  };

  /** Where a hit leads. A step already studied opens its topic; one not started yet, its class. */
  function href(h: SearchHit): string {
    switch (h.kind) {
      case 'roadmap':
        return link.roadmap(h.slug!);
      case 'step':
        return link.lesson(h.slug!);
      case 'topic':
        return link.lesson(h.slug!);
      case 'concept':
        return link.topic(h.slug!, h.concept);
      case 'mission':
        return link.mission(h.id!);
      case 'session':
        return link.session(h.slug!);
    }
  }

  /** On the server (server/search.ts); a search he typed past is cancelled, so the server stops on it. */
  async function search(q: string, signal: AbortSignal): Promise<CoreHit[]> {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal });
    const found = res.ok ? ((await res.json()) as SearchHit[]) : [];
    return found.map((h) => ({ kind: h.kind, title: h.title, href: href(h), context: h.context, snippet: h.snippet }));
  }
</script>

<CoreSearch
  {search}
  kinds={KIND}
  placeholder="Search courses, classes, concepts, missions…"
  empty="Type to search everything you have learned, planned and written."
/>
