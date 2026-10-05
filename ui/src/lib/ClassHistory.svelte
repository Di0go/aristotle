<script lang="ts">
  // The class so far, above a live lesson: every earlier session on the topic, each part folded to one line
  // (open any to reread it), so continuing a class never hides what came before. Tells the live lesson how many
  // steps came before, so its steps are numbered on from them.
  import { placeFigures } from './explorables/index.ts';
  import { topicSessions } from './feed.svelte.ts';
  import { formatDay } from './format.ts';
  import LessonPart from './LessonPart.svelte';
  import { sectionsOf, stepsIn } from './sections.ts';
  import type { PublicItem, Session } from '../../../shared/types.ts';

  let { slug, exclude, steps = $bindable(0) }: { slug: string; exclude: string; steps?: number } = $props();

  let sessions = $state<{ session: Session; items: PublicItem[] }[]>([]);
  let opened = $state(new Set<string>());

  const parts = $derived.by(() => {
    let before = 0;
    return sessions.map((s) => {
      const sections = sectionsOf(s.items, before);
      before += stepsIn(s.items);
      return { session: s.session, sections };
    });
  });
  const figures = $derived(
    placeFigures(
      slug,
      sessions.flatMap((s) => s.items as { id: string; type: string }[]),
    ),
  );

  // The earlier sessions, oldest first: loaded once for this topic and live session.
  $effect(() => {
    const [topic, live] = [slug, exclude];
    let gone = false;
    void (async () => {
      const all = (await topicSessions(topic)).filter((s) => s.id !== live).reverse();
      const records = await Promise.all(
        all.map(
          async (s) =>
            (await (await fetch(`/api/sessions/${encodeURIComponent(s.id)}`)).json()) as { session: Session; items: PublicItem[] },
        ),
      );
      if (gone) return;
      sessions = records.filter((r) => r.session);
      steps = sessions.reduce((n, s) => n + stepsIn(s.items), 0);
    })();
    return () => {
      gone = true;
    };
  });

  function toggle(key: string) {
    const next = new Set(opened);
    if (!next.delete(key)) next.add(key);
    opened = next;
  }
</script>

{#if parts.length}
  <section class="history" aria-label="Earlier in this class">
    {#each parts as p, i (p.session.id)}
      <div class="session-divider">
        <span>Session {i + 1}</span>
        <span class="muted">{formatDay(p.session.startedAt)}</span>
      </div>
      {#each p.sections as sec (sec.key)}
        <LessonPart section={sec} open={opened.has(sec.key)} ontoggle={() => toggle(sec.key)} {figures} />
      {/each}
    {/each}
    <div class="session-divider now">
      <span>Session {parts.length + 1}</span>
      <span class="muted">now</span>
    </div>
  </section>
{/if}

<style>
  .history {
    margin-bottom: 8px;
  }
</style>
