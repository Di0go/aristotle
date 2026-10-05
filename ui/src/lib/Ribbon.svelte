<script lang="ts">
  // The thin strip on the far left: the main places, Claude, and the look settings.
  import { claude } from './claude.svelte.ts';
  import { feed } from './feed.svelte.ts';
  import { countsOf } from './library.ts';
  import { link, router } from './router.svelte.ts';
  import { searchBox } from './search.svelte.ts';
  import { ACCENTS, theme } from './theme.svelte.ts';

  /** The main places, each with its icon (20×20, stroked). The library comes after them, with its own rule for "here". */
  const PLACES = [
    { page: 'now', label: 'Now', href: link.now(), icon: 'M4 4.5h12v11H4zM7 8.5h6M7 11.5h4' },
    {
      page: 'map',
      label: 'Map',
      href: link.map(),
      icon: 'M5 6.5a1.8 1.8 0 1 0 0-.01M15 5.5a1.8 1.8 0 1 0 0-.01M10 15a1.8 1.8 0 1 0 0-.01M6.8 6.3l6.4-.8M6 8.2l3 5.2M14 7.2l-3 5.9',
    },
    {
      page: 'praxis',
      label: 'Praxis',
      href: link.praxis(),
      icon: 'M10 3.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M10 6.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7M10 9.4a.6.6 0 1 0 0 1.2a.6.6 0 1 0 0-1.2',
    },
    { page: 'progress', label: 'Progress', href: link.progress(), icon: 'M4.5 16V10M10 16V4.5M15.5 16v-4' },
    { page: 'log', label: 'Log', href: link.log(), icon: 'M10 3.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M10 6.8V10l2.4 1.8' },
  ] as const;

  /** The appearance popover is open. */
  let settings = $state(false);

  const route = $derived(router.route);
  /** Which place is lit: a session belongs to the log, a mission to Praxis. */
  const section = $derived(route.page === 'session' ? 'log' : route.page === 'mission' ? 'praxis' : route.page);
  const live = $derived(feed.liveSlug !== null);
  const waiting = $derived(feed.missionList.some((m) => m.status === 'open'));
  const fading = $derived(Object.values(feed.topics).reduce((n, t) => n + countsOf(t).fading, 0));

  function onWindowKey(e: KeyboardEvent) {
    if (e.key === 'Escape') settings = false;
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<nav class="ribbon" aria-label="Places">
  <button class="rib" class:on={searchBox.open} onclick={() => searchBox.toggle()} title="Search (Ctrl+K)" aria-label="Search">
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 3.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10M12.2 12.2l4.3 4.3" /></svg>
  </button>
  <span class="gap"></span>
  {#each PLACES as p (p.page)}
    <a
      class="rib"
      class:on={section === p.page}
      href={p.href}
      title={p.label}
      aria-label={p.label}
      aria-current={section === p.page ? 'page' : undefined}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d={p.icon} /></svg>
      {#if p.page === 'now' && feed.pending}<i class="pip turn" title="Your turn"></i>{:else if p.page === 'now' && live}<i class="pip"
        ></i>{/if}
      {#if p.page === 'progress' && fading}<i class="pip"></i>{/if}
      {#if p.page === 'praxis' && waiting}<i class="pip quiet" title="Missions to do"></i>{/if}
    </a>
  {/each}
  <a
    class="rib"
    class:on={section === 'roadmaps' || section === 'roadmap' || section === 'topics'}
    href={link.roadmaps()}
    title="Library"
    aria-label="Library"
  >
    <svg viewBox="0 0 20 20" aria-hidden="true"
      ><path d="M4 4h3.5v12H4zM8.5 4H12v12H8.5zM13.2 4.6l3.2-.9 3 11.6-3.2.9z" transform="translate(-1.2 0)" /></svg
    >
  </a>

  <span class="space"></span>

  <button
    class="rib"
    class:on={claude.open}
    class:asking={claude.asking && !claude.open}
    onclick={() => claude.toggle()}
    title="Claude (Ctrl+`)"
    aria-label="Claude"
    aria-expanded={claude.open}
  >
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 6l4 4-4 4M10.5 14.5h5" /></svg>
    {#if claude.asking && !claude.open}<i class="pip turn"></i>{:else if claude.running}<i class="pip quiet"></i>{/if}
  </button>
  <div class="settings-wrap">
    <button
      class="rib"
      class:on={settings}
      onclick={() => (settings = !settings)}
      title="Appearance"
      aria-label="Appearance"
      aria-expanded={settings}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true"
        ><path d="M10 3.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13M10 3.5v13" /><path d="M10 3.5a6.5 6.5 0 0 1 0 13z" class="fill" /></svg
      >
    </button>
    {#if settings}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="veil" onclick={() => (settings = false)}></div>
      <div class="pop" role="dialog" aria-label="Appearance">
        <p class="pop-h">Appearance</p>
        <div class="seg" role="group" aria-label="Mode">
          <button class:on={theme.value === 'light'} onclick={() => theme.set('light', theme.accent)}>Light</button>
          <button class:on={theme.value === 'dark'} onclick={() => theme.set('dark', theme.accent)}>Dark</button>
        </div>
        <p class="pop-h">Accent</p>
        <div class="swatches" role="group" aria-label="Accent">
          {#each ACCENTS as a (a.id)}
            <button
              class:on={theme.accent === a.id}
              onclick={() => theme.set(theme.value, a.id)}
              title={a.label}
              aria-label={a.label}
              aria-pressed={theme.accent === a.id}
            >
              <span style:background={a.swatch}></span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</nav>

<style>
  .ribbon {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    height: 100%;
    padding: 10px 0;
    background: var(--b1);
    border-right: 1px solid var(--rule);
  }

  .space {
    flex: 1;
  }

  .gap {
    height: 6px;
  }

  .rib {
    position: relative;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: var(--radius);
    background: none;
    color: var(--faint);
    cursor: pointer;
  }

  .rib:hover {
    color: var(--fg);
    background: var(--hover);
    text-decoration: none;
  }

  .rib.on {
    color: var(--acc);
    background: var(--acc-soft);
  }

  .rib svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .rib svg .fill {
    fill: currentColor;
    stroke: none;
  }

  .pip {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--acc);
  }

  .pip.quiet {
    background: var(--solid);
  }

  .pip.turn {
    box-shadow: 0 0 0 2px var(--b1);
    animation: beat 1.8s var(--ease) infinite;
  }

  @keyframes beat {
    50% {
      transform: scale(1.35);
    }
  }

  .asking {
    color: var(--acc);
  }

  .settings-wrap {
    position: relative;
  }

  .veil {
    position: fixed;
    inset: 0;
    z-index: 49;
  }

  .pop {
    position: absolute;
    z-index: 50;
    left: 40px;
    bottom: 0;
    width: 210px;
    padding: 12px;
    background: var(--b0);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
  }

  .pop-h {
    margin: 0 0 8px;
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--muted);
  }

  .pop-h + .seg {
    margin-bottom: 14px;
  }

  .seg {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    padding: 2px;
    background: var(--b2);
    border-radius: var(--radius);
  }

  .seg button {
    padding: 5px 0;
    border: 0;
    border-radius: 5px;
    background: none;
    font-size: 0.85rem;
    color: var(--muted);
    cursor: pointer;
  }

  .seg button.on {
    background: var(--b0);
    color: var(--fg);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
  }

  .swatches {
    display: flex;
    gap: 8px;
  }

  .swatches button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1.5px solid transparent;
    border-radius: 50%;
    background: none;
    cursor: pointer;
  }

  .swatches button.on {
    border-color: var(--fg);
  }

  .swatches span {
    width: 18px;
    height: 18px;
    border-radius: 50%;
  }
</style>
