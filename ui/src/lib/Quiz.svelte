<script lang="ts">
  import type { PublicQuizItem } from '../../../shared/types.ts';
  import { feed } from './feed.svelte.ts';
  import Markdown from './Markdown.svelte';

  let { item, active, readonly = false }: { item: PublicQuizItem; active: boolean; readonly?: boolean } = $props();

  // undefined = not picked yet, null = "I don't know".
  let picks = $state<(number | null | undefined)[]>([]);
  let notes = $state<string[]>([]);
  let noteOpen = $state<boolean[]>([]);
  let sending = $state(false);
  let error = $state<string | null>(null);

  const answered = $derived(Boolean(item.answeredAt));
  const ready = $derived(item.questions.every((_, i) => picks[i] !== undefined));
  const current = $derived(item.questions.findIndex((_, i) => picks[i] === undefined));

  function pick(q: number, choice: number | null) {
    if (answered || sending || readonly) return;
    picks[q] = choice;
  }

  async function submit() {
    if (!ready || sending || answered || readonly) return;
    sending = true;
    error = await feed.answer({
      id: item.id,
      picks: item.questions.map((_, i) => ({ choice: picks[i] ?? null, note: notes[i] || undefined })),
    });
    sending = false;
  }

  function onKey(e: KeyboardEvent) {
    if (!active || answered || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (target.closest('textarea, input')) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
      return;
    }
    const q = current === -1 ? item.questions.length - 1 : current;
    const n = Number(e.key);
    if (e.key === '0') pick(q, null);
    else if (Number.isInteger(n) && n >= 1 && n <= item.questions[q].options.length) pick(q, n - 1);
  }
</script>

<svelte:window onkeydown={onKey} />

<section class="card quiz" class:active class:answered>
  {#each item.questions as q, qi (qi)}
    {@const r = item.responses?.[qi]}
    <div class="question">
      <header class="card-head">
        <span class="label">Quiz{item.questions.length > 1 ? ` ${qi + 1}/${item.questions.length}` : ''}</span>
        {#if q.strand}<span class="strand">{q.strand}</span>{/if}
      </header>
      <Markdown source={q.question} />

      <ol class="options">
        {#each q.options as option, oi (oi)}
          {@const chosen = answered ? r?.choice === oi : picks[qi] === oi}
          <li>
            <button
              class="option"
              class:chosen
              class:right={answered && q.correct === oi}
              class:wrong={answered && chosen && q.correct !== oi}
              disabled={answered || readonly}
              onclick={() => pick(qi, oi)}
            >
              <kbd>{oi + 1}</kbd>
              <Markdown source={option} inline />
            </button>
          </li>
        {/each}
        <li>
          <button
            class="option dont-know"
            class:chosen={answered ? r?.choice === null : picks[qi] === null}
            disabled={answered || readonly}
            onclick={() => pick(qi, null)}
          >
            <kbd>0</kbd> I don't know
          </button>
        </li>
      </ol>

      {#if answered && r}
        <div class="verdict" class:is-right={r.correct}>
          {#if r.correct}
            Right.
          {:else if r.choice === null}
            Fair enough. Here's the answer.
          {:else}
            Not quite.
          {/if}
        </div>
        {#if q.explanation}
          <div class="explanation"><Markdown source={q.explanation} /></div>
        {/if}
        {#if r.note}<p class="your-note"><span>Your note:</span> {r.note}</p>{/if}
      {:else if readonly}
        <p class="unanswered">Not answered.</p>
      {:else}
        {#if noteOpen[qi]}
          <textarea
            class="note"
            rows="2"
            placeholder="Your reasoning, or what you're unsure about (optional)"
            bind:value={notes[qi]}
          ></textarea>
        {:else}
          <button class="link" onclick={() => (noteOpen[qi] = true)}>Add a note</button>
        {/if}
      {/if}
    </div>
  {/each}

  {#if !answered && !readonly}
    <footer class="actions">
      {#if error}<span class="error">{error}</span>{/if}
      <button class="primary" disabled={!ready || sending} onclick={submit}>
        Check {#if active}<kbd>Enter</kbd>{/if}
      </button>
    </footer>
  {/if}
</section>
