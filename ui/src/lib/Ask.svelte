<script lang="ts">
  import type { AskItem } from '../../../shared/types.ts';
  import { feed } from './feed.svelte.ts';
  import Markdown from './Markdown.svelte';

  let { item, active, readonly = false }: { item: AskItem; active: boolean; readonly?: boolean } = $props();

  let text = $state('');
  let sending = $state(false);
  let error = $state<string | null>(null);
  let box = $state<HTMLTextAreaElement>();

  const answered = $derived(Boolean(item.answeredAt));

  const LABELS: Record<AskItem['kind'], string> = {
    problem: 'Problem: solve it yourself',
    explain: 'Explain it in your own words',
    recall: 'From memory',
    open: 'Your answer',
  };

  $effect(() => {
    if (active && !answered) box?.focus({ preventScroll: true });
  });

  async function submit() {
    if (!text.trim() || sending || answered) return;
    sending = true;
    error = await feed.answer({ id: item.id, text });
    sending = false;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  }
</script>

<section class="card ask kind-{item.kind}" class:active class:answered>
  <header class="card-head"><span class="label">{LABELS[item.kind]}</span></header>
  <Markdown source={item.prompt} />

  {#if answered}
    <div class="your-answer">
      <span class="label">You wrote</span>
      <Markdown source={item.response ?? ''} />
    </div>
  {:else if readonly}
    <p class="unanswered">Not answered.</p>
  {:else}
    <textarea
      bind:this={box}
      bind:value={text}
      onkeydown={onKey}
      rows="6"
      placeholder={item.placeholder ?? 'Write your answer. Maths works: $x^2$ or $$\\int_0^1 f$$'}
    ></textarea>
    {#if text.includes('$') || text.includes('\\(')}
      <div class="preview">
        <span class="label">Preview</span>
        <Markdown source={text} />
      </div>
    {/if}
    <footer class="actions">
      {#if error}<span class="error">{error}</span>{/if}
      <button class="primary" disabled={!text.trim() || sending} onclick={submit}>
        Send <kbd>Ctrl</kbd><kbd>Enter</kbd>
      </button>
    </footer>
  {/if}
</section>
