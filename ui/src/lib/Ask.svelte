<script lang="ts">
  // An open question in a lesson: the prompt, a text box with a live maths preview, and the answer once sent.
  import { actions } from './actions.ts';
  import { feed } from './feed.svelte.ts';
  import Markdown from './Markdown.svelte';
  import type { AskItem } from '../../../shared/types.ts';

  const LABELS: Record<AskItem['kind'], string> = {
    problem: 'Problem: work it out yourself',
    explain: 'Explain it in your own words',
    recall: 'From memory, without looking back',
    open: 'Your answer',
  };

  let { item, active, readonly = false }: { item: AskItem; active: boolean; readonly?: boolean } = $props();

  let text = $state('');
  let sending = $state(false);
  let error = $state<string | null>(null);
  let box = $state<HTMLTextAreaElement>();

  const answered = $derived(Boolean(item.answeredAt));
  /** A preview only once there is maths in it: plain text reads fine in the box. */
  const hasMaths = $derived(text.includes('$') || text.includes('\\('));

  // The question waiting for him takes the cursor, without scrolling the page to it.
  $effect(() => {
    if (active && !answered) box?.focus({ preventScroll: true });
  });

  async function submit() {
    if (!text.trim() || sending || answered) return;
    sending = true;
    error = await actions.answer({ id: item.id, text });
    sending = false;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  }
</script>

<section class="sheet ask kind-{item.kind}" class:active class:answered>
  <p class="kicker">{LABELS[item.kind]}</p>
  <div class="question-text"><Markdown source={item.prompt} /></div>

  {#if answered}
    <div class="your-answer">
      <p class="kicker">You wrote</p>
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
      placeholder={item.placeholder ?? 'Write your answer. Maths works: $x^2$ or $$\\int_0^1 f$$'}></textarea>
    {#if hasMaths}
      <div class="preview">
        <p class="kicker">Preview</p>
        <Markdown source={text} />
      </div>
    {/if}
    <footer class="sheet-foot">
      <span class="muted hint">Struggling is the point: write what you think, even if unsure.</span>
      {#if error}<span class="error">{error}</span>{/if}
      <button class="primary" disabled={!text.trim() || sending} onclick={submit}>
        Send <kbd>Ctrl</kbd><kbd>Enter</kbd>
      </button>
    </footer>
  {/if}
</section>
