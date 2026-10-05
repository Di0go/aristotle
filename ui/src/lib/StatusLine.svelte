<script lang="ts">
  // The small bar along the bottom: what's going on, in a few words.
  import { actions } from './actions.ts';
  import { claude } from './claude.svelte.ts';
  import { feed } from './feed.svelte.ts';
  import { countsOf, placeOf } from './library.ts';

  let dev = $state(false);

  const live = $derived(feed.liveSlug !== null);
  const topic = $derived(live ? feed.currentTopic : null);
  const counts = $derived(countsOf(topic ?? undefined));
  const place = $derived(topic ? placeOf(topic.slug, feed.roadmapList) : null);

  // The dev instance (pnpm dev) says so, here and in the tab title, so it is never mistaken for the real one.
  fetch('/api/health')
    .then((r) => r.json())
    .then((h: { instance?: string }) => {
      dev = h.instance === 'dev';
      if (dev && !document.title.startsWith('[dev]')) document.title = `[dev] ${document.title}`;
    })
    .catch(() => {});
</script>

<footer class="statusline">
  {#if dev}<span class="dev" title="The dev instance: its own port and data (.dev/), never your real library">dev</span>{/if}
  {#if feed.pending}<span class="turn">Your turn</span>{:else if feed.wrapping}<span class="work">Wrapping up…</span
    >{:else if live && claude.busy}<span class="work">Claude is working…</span>{/if}
  {#if topic && counts.total}<span>{counts.solid} of {counts.total} solid</span>{/if}
  {#if place}<span>class {place.index + 1} of {place.roadmap.steps.length}</span>{/if}
  {#if live && claude.running && !feed.wrapping}<button
      class="stop"
      onclick={() => actions.stopForToday()}
      title="Claude updates your map and writes where to pick up next time">Stop for today</button
    >{/if}
  <button class="claude" onclick={() => claude.toggle()} title="Claude (Ctrl+`)">
    <i class:on={claude.running} class:ask={claude.asking}></i>
    {claude.asking ? 'Claude is asking something' : claude.running ? 'Claude running' : 'Claude off'}
  </button>
</footer>

<style>
  .statusline {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 16px;
    height: 26px;
    padding: 0 12px;
    background: var(--b1);
    border-top: 1px solid var(--rule);
    font-size: 0.75rem;
    color: var(--faint);
    white-space: nowrap;
  }

  .dev {
    margin-right: auto;
    padding: 0 6px;
    border-radius: 3px;
    background: var(--acc);
    color: var(--b0);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    line-height: 18px;
  }

  .turn {
    color: var(--acc);
    font-weight: 500;
  }

  .work {
    color: var(--fg-2);
  }

  .stop {
    padding: 0 8px;
    border: 1px solid var(--rule-strong);
    border-radius: 4px;
    background: none;
    color: var(--fg-2);
    font-size: inherit;
    line-height: 18px;
    cursor: pointer;
  }

  .stop:hover {
    color: var(--fg);
    border-color: var(--acc);
  }

  .claude {
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

  .claude:hover {
    color: var(--fg);
  }

  .claude i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--faint);
  }

  .claude i.on {
    background: var(--solid);
  }

  .claude i.ask {
    background: var(--acc);
  }
</style>
