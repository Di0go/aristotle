<script lang="ts">
  // The thin strip on the far left: the main places, Claude, and the look settings.
  import { claude } from './claude.svelte.ts';
  import { feed } from './feed.svelte.ts';
  import { link, router } from './router.svelte.ts';
  import { searchBox } from './search.svelte.ts';
  import { ACCENTS, theme } from './theme.svelte.ts';

  /** The four places, each with its icon (20×20, stroked) and its name under it. Everything else is reached from them. */
  const HOME = 'M4 4.5h12v11H4zM7 8.5h6M7 11.5h4';
  const MAP = 'M5 6.5a1.8 1.8 0 1 0 0-.01M15 5.5a1.8 1.8 0 1 0 0-.01M10 15a1.8 1.8 0 1 0 0-.01M6.8 6.3l6.4-.8M6 8.2l3 5.2M14 7.2l-3 5.9';

  /** The appearance popover is open. */
  let settings = $state(false);

  const route = $derived(router.route);
  /** Which place is lit: the map for the map and a class's concepts; Home for Home and what it leads to. */
  const section = $derived(
    route.page === 'map' || route.page === 'topic'
      ? 'map'
      : ['now', 'progress', 'log', 'session', 'praxis', 'mission'].includes(route.page)
        ? 'now'
        : '',
  );
  const live = $derived(feed.liveSlug !== null);

  function onWindowKey(e: KeyboardEvent) {
    if (e.key === 'Escape') settings = false;
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<nav class="ribbon" aria-label="Places">
  <a class="rib" class:on={section === 'now'} href={link.now()} aria-current={section === 'now' ? 'page' : undefined}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d={HOME} /></svg>
    <span class="lbl">Home</span>
    {#if feed.pending}<i class="pip turn" title="Your turn"></i>{:else if live}<i class="pip"></i>{/if}
  </a>
  <a class="rib" class:on={section === 'map'} href={link.map()} aria-current={section === 'map' ? 'page' : undefined}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d={MAP} /></svg>
    <span class="lbl">Map</span>
  </a>
  <button class="rib" class:on={searchBox.open} onclick={() => searchBox.toggle()} title="Search (Ctrl+K)">
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.5 3.5a5 5 0 1 0 0 10a5 5 0 1 0 0-10M12.2 12.2l4.3 4.3" /></svg>
    <span class="lbl">Search</span>
  </button>

  <span class="space"></span>

  <button
    class="rib"
    class:on={claude.open}
    class:asking={claude.asking && !claude.open}
    onclick={() => claude.toggle()}
    title="Claude (Ctrl+`)"
    aria-expanded={claude.open}
  >
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 6l4 4-4 4M10.5 14.5h5" /></svg>
    <span class="lbl">Claude</span>
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

  .rib {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: 46px;
    min-height: 44px;
    text-decoration: none;
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

  .lbl {
    font-size: 0.64rem;
    line-height: 1;
    letter-spacing: 0.01em;
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
    top: 4px;
    right: 10px;
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
