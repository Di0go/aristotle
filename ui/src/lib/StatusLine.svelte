<script lang="ts">
  // The small bar along the bottom: what's going on, in a few words.
  import { claude } from './claude.svelte.ts';
  import { classes } from './classes.svelte.ts';
  import { feed } from './feed.svelte.ts';
  import { countsOf, placeOf } from './library.ts';
  import { link } from './router.svelte.ts';

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
  <span class="left">
    {#if dev}<span class="dev" title="The dev instance: its own port and data (.dev/), never your real library">dev</span>{/if}
    {#if feed.warnings.length}
      <!-- Something he should know (a backup failing, a file skipped): said quietly, but always in view. -->
      <span class="warn" role="status" title={feed.warnings.join('\n')}
        ><i aria-hidden="true"></i><span class="warn-t"
          >{feed.warnings[0]}{feed.warnings.length > 1 ? ` (and ${feed.warnings.length - 1} more)` : ''}</span
        ></span
      >
    {/if}
  </span>
  {#if feed.pending}<a class="turn" href={classes.sittingHref() ?? link.now()}>Your turn</a>{:else if live && claude.busy}<span class="work"
      >Claude is working…</span
    >{/if}
  {#if topic && counts.total}<span>{counts.solid} of {counts.total} solid</span>{/if}
  {#if place}<span>class {place.index + 1} of {place.roadmap.steps.length}</span>{/if}
  <button class="claude" onclick={() => claude.toggle()} title="The terminal Claude Code runs in (Ctrl+`)">
    <i class:on={claude.running} class:ask={claude.asking}></i>
    {claude.asking ? 'Terminal: Claude is asking something' : 'Terminal'}
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

  .left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    margin-right: auto;
  }

  .warn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--shaky);
    cursor: default;
  }

  .warn-t {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .warn i {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--shaky);
  }

  .dev {
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
