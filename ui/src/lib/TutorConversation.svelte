<script lang="ts">
  // The API tutor's side of the drawer: its conversation (what was asked of it, what it said, a line per tool it
  // called) and a box to talk to it. What it teaches is on the page; this is the backstage, like an agent's terminal.
  import { tick } from 'svelte';
  import { renderMarkdown } from './markdown.ts';
  import { link } from './router.svelte.ts';
  import { tutor } from './tutor.svelte.ts';

  let list = $state<HTMLDivElement>();
  let box = $state<HTMLTextAreaElement>();
  let text = $state('');
  /** Whether the list is scrolled to its end, so new lines keep it there (and leave it alone when he scrolled up). */
  let atEnd = true;
  let now = $state(Date.now());

  const secs = $derived(tutor.busy ? Math.max(0, Math.round((now - tutor.busySince) / 1000)) : 0);
  const last = $derived(tutor.entries.at(-1));

  $effect(() => {
    void tutor.entries.length;
    void last?.text;
    if (atEnd) void tick().then(() => list?.scrollTo({ top: list.scrollHeight }));
  });

  // The clock only ticks while there is something to time.
  $effect(() => {
    if (!tutor.busy) return;
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  // Focus the box whenever the drawer opens.
  $effect(() => {
    if (tutor.open) requestAnimationFrame(() => box?.focus());
  });

  function onScroll() {
    if (list) atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  }

  function send() {
    if (!text.trim()) return;
    tutor.say(text);
    text = '';
    atEnd = true;
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
    box.style.height = `${Math.min(box.scrollHeight, 140)}px`;
  }

  /** "show", "update map": a tool's name as a word or two. */
  function toolName(name = '') {
    return name.replace(/_/g, ' ');
  }
</script>

<div class="convo">
  <div class="convo-list" bind:this={list} onscroll={onScroll}>
    {#if !tutor.entries.length}
      <div class="convo-empty">
        {#if tutor.problem}
          <p>{tutor.problem}</p>
          <p><a href={link.settings()}>Open Settings</a></p>
        {:else}
          <p>
            Aristotle's tutor, on <strong>{tutor.command || 'a model API'}</strong>. Start a lesson, a review or a course from the app, or
            write to it here. What it teaches appears on the page; this is what goes on behind it.
          </p>
        {/if}
      </div>
    {/if}
    {#each tutor.entries as e (e.id)}
      {#if e.kind === 'user'}
        <div class="line you">
          <span class="who">You</span>
          <p>{e.text}</p>
        </div>
      {:else if e.kind === 'text'}
        <div class="line said">
          {@html renderMarkdown(e.text, !(tutor.busy && e === last))}
        </div>
      {:else if e.kind === 'tool'}
        <div class="line tool" class:running={e.state === 'running'} class:failed={e.state === 'failed'}>
          <i aria-hidden="true"></i><span class="tool-name">{toolName(e.tool)}</span>{#if e.text}<span class="tool-what">{e.text}</span
            >{/if}
        </div>
      {:else if e.kind === 'error'}
        <div class="line error" role="alert">{e.text}</div>
      {:else}
        <div class="line notice">{e.text}</div>
      {/if}
    {/each}
    {#if tutor.busy && (last?.kind !== 'text' || last.text === '')}
      <div class="line working" aria-live="polite">
        <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>{tutor.doing || 'working'}{secs >= 3 ? `, ${secs} s` : ''}
      </div>
    {/if}
  </div>
  <div class="convo-input">
    <textarea
      bind:this={box}
      bind:value={text}
      oninput={resize}
      onkeydown={onKey}
      rows="1"
      disabled={!tutor.running}
      placeholder={tutor.running ? `Message ${tutor.name}: a question, “go”, “stop for today”…` : 'Set up the model API in Settings first'}
      aria-label="Message the tutor"></textarea>
    {#if tutor.busy}
      <button class="ghost" onclick={() => tutor.stop()} title="Stop what it is doing; a question waiting for you stays open">Stop</button>
    {:else}
      <button class="primary" onclick={send} disabled={!text.trim() || !tutor.running}>Send</button>
    {/if}
  </div>
</div>

<style>
  .convo {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .convo-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 18px 10px;
    font-size: 0.88rem;
  }

  .convo-empty {
    max-width: 62ch;
    color: var(--muted);
  }

  .line {
    max-width: 78ch;
    margin: 0 0 8px;
  }

  .line p {
    margin: 0;
  }

  .you {
    display: flex;
    gap: 10px;
    color: var(--fg-2);
  }

  .you p {
    white-space: pre-wrap;
  }

  .who {
    flex: none;
    width: 34px;
    color: var(--faint);
    font-size: 0.78rem;
    line-height: 1.6;
  }

  .said {
    padding-left: 44px;
    color: var(--fg);
    line-height: 1.55;
  }

  .said :global(p) {
    margin: 0 0 6px;
  }

  .said :global(pre),
  .said :global(code) {
    font-size: 0.82rem;
  }

  .tool {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding-left: 44px;
    margin-bottom: 4px;
    font-family: 'JetBrains Mono Variable', ui-monospace, monospace;
    font-size: 0.76rem;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
  }

  .tool i {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--solid);
    transform: translateY(-1px);
  }

  .tool.running i {
    background: var(--acc);
    animation: pulse 1.2s ease-in-out infinite;
  }

  .tool.failed i {
    background: var(--wrong);
  }

  .tool-name {
    color: var(--fg-2);
  }

  .tool-what {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .error {
    margin-left: 44px;
    padding: 8px 12px;
    border-radius: var(--radius);
    background: var(--wrong-soft);
    color: var(--fg);
    white-space: pre-wrap;
  }

  .notice {
    padding-left: 44px;
    color: var(--faint);
    font-style: italic;
  }

  .working {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 44px;
    color: var(--muted);
  }

  .dots {
    display: inline-flex;
    gap: 3px;
  }

  .dots i {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--acc);
    animation: pulse 1.2s ease-in-out infinite;
  }

  .dots i:nth-child(2) {
    animation-delay: 0.15s;
  }

  .dots i:nth-child(3) {
    animation-delay: 0.3s;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.3;
    }
    50% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dots i,
    .tool.running i {
      animation: none;
    }
  }

  .convo-input {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 8px 14px 12px;
    border-top: 1px solid var(--rule);
  }

  .convo-input textarea {
    flex: 1;
    min-height: 38px;
    max-height: 140px;
    resize: none;
    font-size: 0.88rem;
    background: var(--b1);
    border-color: var(--rule);
    border-radius: var(--radius-lg);
  }

  .convo-input button {
    height: 38px;
    border-radius: var(--radius-lg);
  }
</style>
