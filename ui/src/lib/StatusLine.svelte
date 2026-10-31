<script lang="ts">
  // The small bar along the bottom: the core's status line (@organon/core/ui/StatusLine.svelte: the dev instance said,
  // the server's warnings in view) with what is going on in Aristotle, in a few words: whose turn it is, how much of
  // the class is solid and where it sits in its course, and the tutor's drawer.
  import CoreStatusLine from '@organon/core/ui/StatusLine.svelte';
  import { tutor } from './tutor.svelte.ts';
  import { classes } from './classes.svelte.ts';
  import { feed } from './feed.svelte.ts';
  import { countsOf, placeOf } from './library.ts';
  import { link } from './router.svelte.ts';

  const live = $derived(feed.liveSlug !== null);
  const topic = $derived(live ? feed.currentTopic : null);
  const counts = $derived(countsOf(topic ?? undefined));
  const place = $derived(topic ? placeOf(topic.slug, feed.roadmapList) : null);
</script>

<CoreStatusLine warnings={feed.warnings}>
  {#if feed.pending}<a class="turn" href={classes.sittingHref() ?? link.now()}>Your turn</a>{:else if live && tutor.busy}<span class="work"
      >{tutor.name} is working…</span
    >{/if}
  {#if topic && counts.total}<span>{counts.solid} of {counts.total} solid</span>{/if}
  {#if place}<span>class {place.index + 1} of {place.roadmap.steps.length}</span>{/if}
  <button
    class="tutor"
    onclick={() => tutor.toggle()}
    title={tutor.mode === 'api'
      ? `The tutor's conversation, on ${tutor.command || 'a model API'} (Ctrl+\`)`
      : `The terminal ${tutor.name} runs in (Ctrl+\`)`}
  >
    <i class:on={tutor.running} class:ask={tutor.asking} class:off={Boolean(tutor.problem)}></i>
    {tutor.asking ? `Terminal: ${tutor.name} is asking something` : tutor.mode === 'api' ? 'Tutor' : 'Terminal'}
  </button>
</CoreStatusLine>

<style>
  .turn {
    color: var(--acc);
    font-weight: 500;
  }

  .work {
    color: var(--fg-2);
  }

  .tutor {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font-size: inherit;
    cursor: pointer;
  }

  .tutor:hover {
    color: var(--fg);
  }

  .tutor i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--faint);
  }

  .tutor i.on {
    background: var(--solid);
  }

  .tutor i.ask {
    background: var(--acc);
  }

  .tutor i.off {
    background: var(--shaky);
  }
</style>
