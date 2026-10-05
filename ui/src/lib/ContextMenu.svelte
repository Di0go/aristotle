<script lang="ts">
  // The menu on right-clicking selected text: copy it, search for it in Aristotle, gloss it (Claude Code explains
  // it in a hover card, which then shows wherever the phrase appears), or ask a question about it (answered beside
  // the step, kept with it). Without a selection, in a text
  // box or in the terminal, or with Shift held, the browser's own menu opens instead.
  import { onMount, tick } from 'svelte';
  import { asides } from './aside.svelte.ts';
  import { feed } from './feed.svelte.ts';
  import { glossing } from './gloss.svelte.ts';
  import { router } from './router.svelte.ts';
  import { searchBox } from './search.svelte.ts';

  /** As server/glosses.ts: longer is a passage, not a phrase. */
  const MAX_PHRASE = 120;
  const WIDTH = 220;
  /** Where the browser's menu is still wanted. */
  const NATIVE = 'input, textarea, select, [contenteditable], .xterm';
  /** The block a selection sits in, for the gloss's context. */
  const BLOCK = 'p, li, td, th, dd, dt, blockquote, figcaption, h1, h2, h3, h4, h5, h6';

  type Item = { label: string; hint: string; run: () => void; disabled?: string };

  let open = $state<{ x: number; y: number; text: string; items: Item[] } | null>(null);
  let menu = $state<HTMLElement>();

  onMount(() => {
    const onMenu = (e: MouseEvent) => {
      const sel = getSelection();
      const text = sel?.toString().replace(/\s+/g, ' ').trim() ?? '';
      if (e.shiftKey || !text || !sel?.rangeCount || (e.target as Element | null)?.closest?.(NATIVE)) return;
      e.preventDefault();
      // A copy: the selection's own range moves with whatever he clicks next.
      void show(e.clientX, e.clientY, text, sel.getRangeAt(0).cloneRange());
    };
    const away = (e: Event) => {
      if (!(e.target as Element | null)?.closest?.('.context-menu')) close();
    };
    document.addEventListener('contextmenu', onMenu);
    document.addEventListener('pointerdown', away, true);
    addEventListener('scroll', close, { passive: true, capture: true });
    addEventListener('resize', close);
    addEventListener('blur', close);
    return () => {
      document.removeEventListener('contextmenu', onMenu);
      document.removeEventListener('pointerdown', away, true);
      removeEventListener('scroll', close, { capture: true });
      removeEventListener('resize', close);
      removeEventListener('blur', close);
    };
  });

  async function show(x: number, y: number, text: string, range: Range) {
    const items: Item[] = [
      { label: 'Copy', hint: 'Ctrl C', run: () => void copy(text) },
      { label: 'Search Aristotle', hint: 'Ctrl K', run: () => searchBox.toggle(true, text) },
      {
        label: 'Gloss',
        hint: 'Explain it',
        run: () => gloss(text, range),
        disabled: text.length > MAX_PHRASE ? 'Select a word or a short phrase to gloss it' : undefined,
      },
      { label: 'Ask about this', hint: 'A question', run: () => ask(text, range) },
    ];
    open = { x, y, text, items };
    await tick();
    if (!menu) return;
    // Inside the window, flipped to the left or above when it would run off the edge.
    const r = menu.getBoundingClientRect();
    open.x = x + r.width > innerWidth - 8 ? Math.max(8, x - r.width) : x;
    open.y = y + r.height > innerHeight - 8 ? Math.max(8, y - r.height) : y;
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }

  function close() {
    open = null;
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // No clipboard API on plain http://aristotle.test: the old way still copies the selection.
      document.execCommand('copy');
    }
  }

  /** Asks for the gloss, with the sentence around it and the topic being read, and pins its card under the selection. */
  function gloss(text: string, range: Range) {
    void glossing.ask(text, range, elementOf(range)?.closest(BLOCK)?.textContent ?? undefined, topicHere());
  }

  /** Opens the question panel by the selection, tied to the lesson item it is in. */
  function ask(text: string, range: Range) {
    const el = elementOf(range);
    const item = el?.closest<HTMLElement>('.notebook > .entry')?.id.replace(/^item-/, '') || undefined;
    asides.start(text, range, topicHere(), item, el?.closest(BLOCK)?.textContent ?? undefined);
  }

  function elementOf(range: Range): Element | null {
    const node = range.commonAncestorContainer;
    return node instanceof Element ? node : node.parentElement;
  }

  /** The topic being read: the page's, or the lesson running now. */
  function topicHere(): string | undefined {
    const route = router.route;
    return route.page === 'topic' || route.page === 'lesson' || route.page === 'step' ? route.slug : (feed.liveSlug ?? undefined);
  }

  function choose(item: Item) {
    if (item.disabled) return;
    close();
    item.run();
  }

  /** Arrows move between items, Escape closes, Enter and Space choose (as buttons do). */
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = [...(menu?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }
</script>

{#if open}
  <div
    class="context-menu"
    bind:this={menu}
    role="menu"
    tabindex="-1"
    aria-label="Selected text"
    style:left="{open.x}px"
    style:top="{open.y}px"
    style:min-width="{WIDTH}px"
    onkeydown={onKey}
  >
    {#each open.items as item (item.label)}
      <button role="menuitem" disabled={Boolean(item.disabled)} title={item.disabled} onclick={() => choose(item)}>
        <span class="label">{item.label}</span>
        <span class="hint">{item.hint}</span>
      </button>
    {/each}
    <p class="native">Shift + right-click for the browser's menu</p>
  </div>
{/if}

<style>
  .context-menu {
    position: fixed;
    z-index: 70;
    padding: 4px;
    background: var(--b0);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    font-size: 0.86rem;
    animation: pop 0.1s var(--ease);
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
  }

  button {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 24px;
    width: 100%;
    padding: 6px 10px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  button:hover:not(:disabled),
  button:focus-visible {
    background: var(--hover);
    outline: none;
  }

  button:disabled {
    color: var(--faint);
    cursor: default;
  }

  .hint {
    font-size: 0.76rem;
    color: var(--faint);
  }

  .native {
    margin: 4px 0 0;
    padding: 6px 10px 4px;
    border-top: 1px solid var(--rule);
    font-size: 0.72rem;
    color: var(--faint);
  }
</style>
