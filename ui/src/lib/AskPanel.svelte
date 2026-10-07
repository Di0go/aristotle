<script lang="ts">
  // The "Ask about this" panel: it opens by the passage he selected, takes his question, and shows Claude's answer
  // there, while the class carries on. The answer is kept under the step (ClassPage.svelte). Follows the passage as
  // the page scrolls; Escape or a click elsewhere closes it.
  import { onMount, tick } from 'svelte';
  import { asides } from './aside.svelte.ts';
  import { renderMarkdown } from './markdown.ts';

  const WIDTH = 400;

  let layout = $state(0);
  let box = $state<HTMLTextAreaElement>();
  let text = $state('');

  const q = $derived(asides.open);
  /** Under the passage's last line, inside the window; above it when there is no room below. */
  const pos = $derived.by(() => {
    void layout;
    const lines = q ? [...q.anchor.getClientRects()].filter((r) => r.width > 0) : [];
    const r = lines.at(-1) ?? q?.anchor.getBoundingClientRect();
    if (!r || (!r.width && !r.height)) return null;
    const x = Math.min(Math.max(12, r.left + r.width / 2 - WIDTH / 2), innerWidth - WIDTH - 12);
    // Below the passage unless there is clearly more room above; either way, never past the window's edge.
    const below = innerHeight - r.bottom - 20;
    const above = below < 360 && r.top - 20 > below;
    return { x, y: above ? r.top - 8 : r.bottom + 8, above, room: Math.max(160, above ? r.top - 20 : below) };
  });

  // A new passage starts with an empty box, focused.
  $effect(() => {
    if (q?.state !== 'writing') return;
    text = '';
    void tick().then(() => box?.focus());
  });

  onMount(() => {
    const move = () => layout++;
    const down = (e: PointerEvent) => {
      if (asides.open && !(e.target as Element | null)?.closest?.('.ask-panel, .context-menu')) asides.close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && asides.open) asides.close();
    };
    addEventListener('scroll', move, { passive: true, capture: true });
    addEventListener('resize', move);
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      removeEventListener('scroll', move, { capture: true });
      removeEventListener('resize', move);
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void asides.send(text);
    }
  }
</script>

{#if q && pos}
  <div
    class="ask-panel"
    class:above={pos.above}
    style:left="{pos.x}px"
    style:top="{pos.y}px"
    style:width="{WIDTH}px"
    style:max-height="{pos.room}px"
    role="dialog"
    aria-label="Ask about this"
  >
    <p class="passage">“{q.passage}”</p>
    {#if q.state === 'writing'}
      <textarea
        bind:this={box}
        bind:value={text}
        onkeydown={onKey}
        rows="2"
        placeholder="What do you want to know about this?"
        aria-label="Your question"></textarea>
      <div class="foot">
        <span class="hint">Enter to ask. The class carries on.</span>
        <button class="primary small" disabled={!text.trim()} onclick={() => void asides.send(text)}>Ask</button>
      </div>
    {:else}
      <p class="question">{q.question}</p>
      {#if q.state === 'waiting'}
        <p class="wait"><span class="dot" aria-hidden="true"></span>Claude is answering…</p>
      {:else if q.state === 'error'}
        <p class="error">{q.error}</p>
        <div class="foot"><button class="link" onclick={() => asides.again()}>Try again</button></div>
      {:else if q.answer}
        <div class="answer md-box">{@html renderMarkdown(q.answer.answer)}</div>
        <div class="foot">
          <span class="hint">{q.item ? 'Kept with this step.' : 'Kept with your questions.'}</span>
          <button class="link" onclick={() => asides.again()}>Ask another</button>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .ask-panel {
    position: fixed;
    z-index: 65;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    background: var(--b0);
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    overflow-y: auto;
    font-size: 0.88rem;
    line-height: 1.55;
    animation: pop 0.14s var(--ease);
  }

  .ask-panel.above {
    transform: translateY(-100%);
    animation: none;
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
  }

  .passage {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow: hidden;
    margin: 0;
    padding-left: 10px;
    border-left: 2px solid var(--acc-line);
    color: var(--muted);
    font-size: 0.82rem;
  }

  textarea {
    width: 100%;
    resize: vertical;
    padding: 8px 10px;
    background: var(--b1);
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    color: var(--fg);
    font: inherit;
  }

  textarea:focus {
    outline: none;
    border-color: var(--acc);
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .hint {
    font-size: 0.76rem;
    color: var(--faint);
  }

  .question {
    margin: 0;
    font-weight: 600;
    color: var(--fg);
  }

  .answer {
    color: var(--fg-2);
  }

  .answer :global(p) {
    margin: 0 0 8px;
  }

  .answer :global(p:last-child) {
    margin: 0;
  }

  .wait {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    color: var(--muted);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--acc);
    animation: breathe 1.1s ease-in-out infinite alternate;
  }

  @keyframes breathe {
    from {
      opacity: 0.25;
    }
  }

  .error {
    margin: 0;
    color: var(--wrong);
  }
</style>
