<script lang="ts">
  // An agent's terminal inside the drawer (Claude Code, or Codex, Gemini CLI, opencode): xterm.js, loaded on first open.
  import { onMount } from 'svelte';
  import { theme as look } from './theme.svelte.ts';
  import { tutor } from './tutor.svelte.ts';
  import type { FitAddon } from '@xterm/addon-fit';
  import type { Terminal as XTerm } from '@xterm/xterm';

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
      term.onData((data) => tutor.input(data));
      term.onKey(() => tutor.keyed());
      // A replay is the whole screen so far: start from a clean terminal, or it would print twice.
      unsubscribe = tutor.subscribe((data, replay) => {
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

  // Refit and focus whenever the drawer opens (a frame later, once it is laid out).
  $effect(() => {
    if (tutor.open) {
      requestAnimationFrame(() => {
        fit();
        term?.focus();
      });
    }
  });

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

  /** Fits the terminal to the drawer and tells the agent its new size. Only while open: a hidden drawer has none. */
  function fit() {
    if (!term || !fitAddon || !tutor.open) return;
    fitAddon.fit();
    tutor.resize(term.cols, term.rows);
  }
</script>

<div class="xterm-host" bind:this={host}></div>
