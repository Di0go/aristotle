<script lang="ts">
  // Talk to the tutor from Aristotle: the message goes to the agent running in the drawer (typed in), or to the API tutor.
  import { link } from './router.svelte.ts';
  import { tutor } from './tutor.svelte.ts';

  let text = $state('');
  let box = $state<HTMLTextAreaElement>();

  function send() {
    if (!text.trim()) return;
    tutor.say(text);
    text = '';
    resize();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  }

  /** Grows the box with its text, up to a limit. Reset to auto first, or scrollHeight never shrinks. */
  function resize() {
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 160)}px`;
  }

  /** Starts the agent in the drawer (resuming the last conversation, or a new one) and shows it. */
  function startAgent(resume: boolean) {
    tutor.start(resume);
    tutor.toggle(true);
  }
</script>

<div class="composer">
  {#if tutor.running}
    {#if tutor.asking}
      <button class="asking" onclick={() => tutor.toggle(true)}>{tutor.name} is asking something in the terminal. Open it</button>
    {/if}
    <div class="composer-row">
      <textarea
        bind:this={box}
        bind:value={text}
        oninput={resize}
        onkeydown={onKey}
        rows="1"
        placeholder="Message {tutor.name}: a question, “go”, “stop for today”…"
        aria-label="Message {tutor.name}"></textarea>
      <button class="primary" onclick={send} disabled={!text.trim()}>Send</button>
    </div>
  {:else if tutor.connected && tutor.problem}
    <p class="composer-off">{tutor.problem} <a href={link.settings()}>Settings</a></p>
  {:else if tutor.connected}
    <p class="composer-off">
      {tutor.name} isn't running here. If you're talking to it in your own terminal, carry on there. Otherwise
      <button class="link" onclick={() => startAgent(true)}>resume the last conversation</button>
      or
      <button class="link" onclick={() => startAgent(false)}>start a new one</button>.
    </p>
  {/if}
</div>
