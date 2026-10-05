<script lang="ts">
  // A graded multiple-choice check: options, "I don't know", a note per question, and right or wrong once answered.
  import { actions } from './actions.ts';
  import { feed } from './feed.svelte.ts';
  import Markdown from './Markdown.svelte';
  import type { PublicQuizItem } from '../../../shared/types.ts';

  let { item, active, readonly = false }: { item: PublicQuizItem; active: boolean; readonly?: boolean } = $props();

  // Per question. In picks, undefined = not picked yet, null = "I don't know".
  let picks = $state<(number | null | undefined)[]>([]);
  let notes = $state<string[]>([]);
  let noteOpen = $state<boolean[]>([]);
  let showAll = $state<boolean[]>([]);
  let sending = $state(false);
  let error = $state<string | null>(null);

  const answered = $derived(Boolean(item.answeredAt));
  // Read back later, an answered question shows only his pick and the right one; the rest wait behind a link.
  const compact = $derived(answered && readonly);
  const ready = $derived(item.questions.every((_, i) => picks[i] !== undefined));
  /** The first question without a pick: where the number keys go. */
  const current = $derived(item.questions.findIndex((_, i) => picks[i] === undefined));

  /** Whether an option (null for "I don't know") is listed: always, unless the question is compact. */
  function shown(qi: number, oi: number | null): boolean {
    return !compact || showAll[qi] || item.responses?.[qi]?.choice === oi || (oi !== null && item.questions[qi].correct === oi);
  }

  function pick(q: number, choice: number | null) {
    if (answered || sending || readonly) return;
    picks[q] = choice;
  }

  async function submit() {
    if (!ready || sending || answered || readonly) return;
    sending = true;
    error = await actions.answer({
      id: item.id,
      picks: item.questions.map((_, i) => ({ choice: picks[i] ?? null, note: notes[i] || undefined })),
    });
    sending = false;
  }

  /** Number keys pick for the current question (0 for "I don't know"), Enter checks; never while typing a note. */
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

<section class="sheet quiz" class:active class:answered>
  {#each item.questions as q, qi (qi)}
    {@const r = item.responses?.[qi]}
    <div class="question">
      <header class="question-head">
        <span class="kicker">{item.questions.length > 1 ? `Check · question ${qi + 1} of ${item.questions.length}` : 'Check'}</span>
        {#if q.strand}<span class="tag">{q.strand}</span>{/if}
      </header>
      <div class="question-text"><Markdown source={q.question} /></div>

      <ol class="options">
        {#each q.options as option, oi (oi)}
          {@const chosen = answered ? r?.choice === oi : picks[qi] === oi}
          {#if shown(qi, oi)}
            <li>
              <button
                class="option"
                class:chosen
                class:right={answered && q.correct === oi}
                class:wrong={answered && chosen && q.correct !== oi}
                disabled={answered || readonly}
                onclick={() => pick(qi, oi)}
              >
                <span class="cb" aria-hidden="true"></span>
                <span class="option-text"><Markdown source={option} inline /></span>
                {#if answered && q.correct === oi}<span class="verdict-mark" aria-label="right answer">✓</span
                  >{:else if answered && chosen}<span class="verdict-mark" aria-label="your answer, wrong">✗</span>{:else}<kbd class="key"
                    >{oi + 1}</kbd
                  >{/if}
              </button>
            </li>
          {/if}
        {/each}
        {#if shown(qi, null)}
          <li>
            <button
              class="option dont-know"
              class:chosen={answered ? r?.choice === null : picks[qi] === null}
              disabled={answered || readonly}
              onclick={() => pick(qi, null)}
            >
              <span class="cb" aria-hidden="true"></span>
              <span class="option-text">I don't know</span>
              <kbd class="key">0</kbd>
            </button>
          </li>
        {/if}
      </ol>
      {#if compact && !showAll[qi]}
        <button class="link more-options" onclick={() => (showAll[qi] = true)}>Show all {q.options.length + 1} options</button>
      {/if}

      {#if answered && r}
        <div class="explanation" class:is-right={r.correct}>
          <p class="verdict">
            {#if r.correct}Right.{:else if r.choice === null}Here's the answer.{:else}Not quite.{/if}
          </p>
          {#if q.explanation}<Markdown source={q.explanation} />{/if}
          {#if r.note}<p class="your-note"><span>Your note</span> {r.note}</p>{/if}
        </div>
      {:else if readonly}
        <p class="unanswered">Not answered.</p>
      {:else if noteOpen[qi]}
        <textarea class="note" rows="2" placeholder="Your reasoning, or what you're unsure about (optional)" bind:value={notes[qi]}
        ></textarea>
      {:else}
        <button class="link add-note" onclick={() => (noteOpen[qi] = true)}>Add a note on your reasoning</button>
      {/if}
    </div>
  {/each}

  {#if !answered && !readonly}
    <footer class="sheet-foot">
      <span class="muted hint">Pick with the number keys, <kbd>0</kbd> if you don't know.</span>
      {#if error}<span class="error">{error}</span>{/if}
      <button class="primary" disabled={!ready || sending} onclick={submit}>
        Check {#if active}<kbd>Enter</kbd>{/if}
      </button>
    </footer>
  {/if}
</section>
