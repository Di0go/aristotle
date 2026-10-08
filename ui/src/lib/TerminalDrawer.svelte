<script lang="ts">
  // Claude Code's terminal, docked at the bottom of every page. xterm.js loads on first open.
  import { onMount } from 'svelte';
  import { claude } from './claude.svelte.ts';
  import { migrateKey } from './storage.ts';
  import { theme as look } from './theme.svelte.ts';
  import type { FitAddon } from '@xterm/addon-fit';
  import type { Terminal as XTerm } from '@xterm/xterm';

  const HEIGHT_KEY = 'aristotle.drawer-height';
  /** The name it had before the app was renamed, moved over on first read. */
  const OLD_HEIGHT_KEY = 'mind-gym.drawer-height';

  /** ANSI colours readable on Aristotle's own surfaces, one set per mode. */
  const ANSI_DARK = {
    black: '#3a3936',
    red: '#f08a76',
    green: '#6cc58f',
    yellow: '#e2b34f',
    blue: '#6ea8f0',
    magenta: '#d68bd0',
    cyan: '#5cc4c9',
    white: '#d8d5cf',
    brightBlack: '#6b6862',
    brightRed: '#f5a593',
    brightGreen: '#8fd8ab',
    brightYellow: '#f0c870',
    brightBlue: '#94c0f5',
    brightMagenta: '#e3a8de',
    brightCyan: '#86d6da',
    brightWhite: '#ffffff',
  };
  const ANSI_LIGHT = {
    black: '#1f1e1c',
    red: '#b4402f',
    green: '#2f7d4f',
    yellow: '#8a6200',
    blue: '#2a63b8',
    magenta: '#9b3c8f',
    cyan: '#1d7480',
    white: '#8a877f',
    brightBlack: '#6b6862',
    brightRed: '#c9503c',
    brightGreen: '#3a9460',
    brightYellow: '#a87900',
    brightBlue: '#3a78d2',
    brightMagenta: '#b24fa5',
    brightCyan: '#258896',
    brightWhite: '#4a4843',
  };

  let host = $state<HTMLDivElement>();
  let height = $state(readHeight());
  let term: XTerm | null = null;
  let fitAddon: FitAddon | null = null;

  onMount(() => {
    let unsubscribe = () => {};
    let disposed = false;
    const observer = new ResizeObserver(() => fit());

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/xterm/css/xterm.css'),
      ]);
      // The drawer may have gone while xterm was loading.
      if (disposed || !host) return;
      term = new Terminal({
        fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
        fontSize: 13.5,
        lineHeight: 1.15,
        cursorBlink: true,
        cursorStyle: 'bar',
        cursorWidth: 2,
        allowProposedApi: false,
        scrollback: 5000,
        theme: xtermTheme(),
      });
      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(host);
      term.onData((data) => claude.input(data));
      term.onKey(() => claude.keyed());
      // A replay is the whole screen so far: start from a clean terminal, or it would print twice.
      unsubscribe = claude.subscribe((data, replay) => {
        if (replay) term?.reset();
        term?.write(data);
      });
      observer.observe(host);
      fit();
      term.focus();
    })();

    return () => {
      disposed = true;
      unsubscribe();
      observer.disconnect();
      term?.dispose();
    };
  });

  // Follow Aristotle's theme switch.
  $effect(() => {
    void look.value;
    requestAnimationFrame(() => term && (term.options.theme = xtermTheme()));
  });

  // Tell the page how much of the bottom the drawer covers, so nothing hides behind it.
  $effect(() => {
    document.documentElement.style.setProperty('--drawer-space', claude.open ? `${height}px` : '0px');
  });

  // Refit and focus whenever the drawer opens (a frame later, once it is laid out).
  $effect(() => {
    if (claude.open) {
      requestAnimationFrame(() => {
        fit();
        term?.focus();
      });
    }
  });

  function readHeight(): number {
    try {
      migrateKey(OLD_HEIGHT_KEY, HEIGHT_KEY);
      const saved = Number(localStorage.getItem(HEIGHT_KEY));
      if (saved >= 160) return saved;
    } catch {
      // Storage may be unavailable; the default is fine.
    }
    return Math.round(window.innerHeight * 0.42);
  }

  function saveHeight() {
    try {
      localStorage.setItem(HEIGHT_KEY, String(height));
    } catch {
      // Not essential.
    }
  }

  /** xterm's colours: the page's surface and ink, the accent for the cursor, and the ANSI set for the mode. */
  function xtermTheme() {
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    return {
      background: v('--b0'),
      foreground: v('--fg'),
      cursor: v('--acc'),
      cursorAccent: v('--b0'),
      selectionBackground: v('--accent-soft'),
      ...(look.dark ? ANSI_DARK : ANSI_LIGHT),
    };
  }

  /** Fits the terminal to the drawer and tells Claude Code its new size. Only while open: a hidden drawer has none. */
  function fit() {
    if (!term || !fitAddon || !claude.open) return;
    fitAddon.fit();
    claude.resize(term.cols, term.rows);
  }

  /** Drag the top edge: between 160px and all but 120px of the window. Saved and refitted on release. */
  function startResize(e: PointerEvent) {
    const startY = e.clientY;
    const startH = height;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      height = Math.min(Math.max(startH + (startY - ev.clientY), 160), window.innerHeight - 120);
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      saveHeight();
      fit();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  }
</script>

<section class="drawer" class:open={claude.open} style:height="{height}px" aria-label="Claude Code" aria-hidden={!claude.open}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="drawer-grip" onpointerdown={startResize} title="Drag to resize"></div>
  <header class="drawer-head">
    <span class="drawer-title"><i class="run-dot" class:on={claude.running}></i>Terminal · Claude Code</span>
    <span class="muted drawer-state">
      {#if !claude.connected}Connecting…{:else if claude.running}Running in ~/Projects/Aristotle{:else}Not running{/if}
    </span>
    <div class="drawer-actions">
      {#if claude.connected && !claude.running}
        <button class="primary small" onclick={() => claude.start()}>Start Claude</button>
        <button class="ghost small" onclick={() => claude.start(true)} title="claude --continue">Resume last</button>
      {:else if claude.running}
        <button class="ghost small" onclick={() => claude.stop()} title="End this Claude Code session">Stop</button>
      {/if}
      <button class="ghost small" onclick={() => claude.toggle(false)} aria-label="Hide the terminal" title="Hide (Ctrl+`)">Hide</button>
    </div>
  </header>
  <div class="xterm-host" bind:this={host}></div>
</section>
