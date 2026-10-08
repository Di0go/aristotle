<script lang="ts">
  // The tutor's drawer, docked at the bottom of every page: an agent's terminal (TerminalView), or the API tutor's
  // conversation (TutorConversation), with what runs there and the controls that go with it.
  import { link } from './router.svelte.ts';
  import { migrateKey } from './storage.ts';
  import TerminalView from './TerminalView.svelte';
  import { tutor } from './tutor.svelte.ts';
  import TutorConversation from './TutorConversation.svelte';
  import { AGENTS } from '../../../shared/tutor.ts';

  const HEIGHT_KEY = 'aristotle.drawer-height';
  /** The name it had before the app was renamed, moved over on first read. */
  const OLD_HEIGHT_KEY = 'mind-gym.drawer-height';

  let height = $state(readHeight());

  /** "Claude Code", "Codex CLI"…, or the API tutor. */
  const title = $derived(
    tutor.mode === 'api' ? 'Tutor · Aristotle' : `Terminal · ${AGENTS.find((a) => a.id === tutor.engine)?.name ?? tutor.name}`,
  );
  const where = $derived(
    !tutor.connected
      ? 'Connecting…'
      : tutor.problem
        ? tutor.problem
        : tutor.mode === 'api'
          ? `on ${shortModel(tutor.command)}`
          : tutor.running
            ? 'Running in the Aristotle folder'
            : 'Not running',
  );

  /** A model as people name it: a local server's file path ("/opt/models/qwen3-32b.gguf") without its folder and suffix. */
  function shortModel(model: string): string {
    return model.replace(/^.*\//, '').replace(/\.gguf$/i, '') || 'a model API';
  }

  // Tell the page how much of the bottom the drawer covers, so nothing hides behind it.
  $effect(() => {
    document.documentElement.style.setProperty('--drawer-space', tutor.open ? `${height}px` : '0px');
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

  /** Drag the top edge: between 160px and all but 120px of the window. Saved on release. */
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
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  }
</script>

<section class="drawer" class:open={tutor.open} style:height="{height}px" aria-label="The tutor" aria-hidden={!tutor.open}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="drawer-grip" onpointerdown={startResize} title="Drag to resize"></div>
  <header class="drawer-head">
    <span class="drawer-title"><i class="run-dot" class:on={tutor.running} class:off={Boolean(tutor.problem)}></i>{title}</span>
    <span class="muted drawer-state" title={tutor.command}>{where}</span>
    <div class="drawer-actions">
      {#if tutor.mode === 'api'}
        {#if tutor.entries.length && !tutor.busy}
          <button class="ghost small" onclick={() => tutor.clear()} title="Start a new conversation (the lesson's record stays)"
            >New conversation</button
          >
        {/if}
      {:else if tutor.connected && !tutor.running && !tutor.problem}
        <button class="primary small" onclick={() => tutor.start()}>Start {tutor.name}</button>
        <button class="ghost small" onclick={() => tutor.start(true)} title="Carry on its last conversation">Resume last</button>
      {:else if tutor.running}
        <button class="ghost small" onclick={() => tutor.stop()} title="End this {tutor.name} session">Stop</button>
      {/if}
      <a
        class="button ghost small"
        href={link.settings()}
        onclick={() => tutor.toggle(false)}
        title="Who teaches: Claude Code, another agent, or a model API">Settings</a
      >
      <button class="ghost small" onclick={() => tutor.toggle(false)} aria-label="Hide the drawer" title="Hide (Ctrl+`)">Hide</button>
    </div>
  </header>
  {#if tutor.mode === 'api'}
    <TutorConversation />
  {:else}
    <TerminalView />
  {/if}
</section>
