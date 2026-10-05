<script lang="ts">
  // Talk to Claude from Aristotle: types the message into the Claude Code running in the drawer.
  import { claude } from './claude.svelte.ts';

  let text = $state('');
  let box = $state<HTMLTextAreaElement>();

  function send() {
    if (!text.trim()) return;
    claude.say(text);
    text = '';
    resize();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  }

  function resize() {
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 160)}px`;
  }
</script>

<div class="composer">
  {#if claude.running}
    {#if claude.asking}
      <button class="asking" onclick={() => claude.toggle(true)}>Claude is asking something in the terminal. Open it</button>
    {/if}
    <div class="composer-row">
      <textarea
        bind:this={box}
        bind:value={text}
        oninput={resize}
        onkeydown={onKey}
        rows="1"
        placeholder="Message Claude: a question, “go”, “stop for today”…"
        aria-label="Message Claude"
      ></textarea>
      <button class="primary" onclick={send} disabled={!text.trim()}>Send</button>
    </div>
  {:else if claude.connected}
    <p class="composer-off">
      Claude isn't running here. If you're talking to it in your own terminal, carry on there. Otherwise
      <button class="link" onclick={() => { claude.start(true); claude.toggle(true); }}>resume the last conversation</button>
      or
      <button class="link" onclick={() => { claude.start(); claude.toggle(true); }}>start a new one</button>.
    </p>
  {/if}
</div>
