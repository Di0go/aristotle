<script lang="ts">
  // The chat beside a lesson: talk with Aristotle about anything while reading. Each message goes with where he is
  // and what is on his screen, so he never has to explain; the answer streams in as it is written, even while a
  // question waits for him, and the lesson carries on untouched. One conversation per class, kept.
  import { tick } from 'svelte';
  import { feed } from './feed.svelte.ts';
  import { renderMarkdown } from './markdown.ts';
  import { pageLabel, type ClassPage } from './steps.ts';
  import type { PublicItem } from '../../../shared/types.ts';

  let { thread, title, page = null }: { thread: string; title: string; page?: ClassPage | null } = $props();

  const MAX_PAGE = 9000;

  let text = $state('');
  let sending = $state(false);
  let error = $state<string | null>(null);
  let list = $state<HTMLElement>();
  let box = $state<HTMLTextAreaElement>();

  const messages = $derived(feed.chats[thread] ?? null);
  const draft = $derived(feed.chatDrafts[thread] ?? null);
  /** Where he is, as the chat is told and as he sees it under the box. */
  const where = $derived(page ? `${title} · ${pageLabel(page)}${page.title ? `: ${page.title}` : ''}` : title);

  $effect(() => {
    void feed.loadChat(thread);
  });

  // Keep the newest message in view as the conversation grows and an answer streams in.
  $effect(() => {
    void messages?.length;
    void draft?.text;
    void tick().then(() => list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' }));
  });

  // The box grows with what he writes, up to a few lines.
  $effect(() => {
    void text;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 180)}px`;
  });

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    sending = true;
    error = null;
    text = '';
    const step = page?.items.find((i) => i.type === 'block' && i.kind === 'step')?.id;
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(thread)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: body, where, page: page ? screen(page) : undefined, step }),
      });
      if (!res.ok) {
        error = ((await res.json()) as { error?: string }).error ?? 'Aristotle could not answer';
        text = body;
      }
    } catch {
      error = 'Aristotle is not reachable';
      text = body;
    }
    sending = false;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  /** The page as text, the way he sees it: the step, its checks and his answers. */
  function screen(p: ClassPage): string {
    const out = [...p.warmup, ...p.items].map(itemText).filter(Boolean).join('\n\n');
    return out.length > MAX_PAGE ? `${out.slice(0, MAX_PAGE)}\n…` : out;
  }

  function itemText(i: PublicItem): string {
    if (i.type === 'block') return `${i.title ? `## ${i.title}\n` : ''}${i.markdown.replace(/<svg[\s\S]*?<\/svg>/g, '[a drawing]')}`;
    if (i.type === 'quiz') {
      return i.questions
        .map((q, n) => {
          const r = i.responses?.[n];
          const picked = r
            ? r.choice === null
              ? "he said he didn't know"
              : `he picked "${q.options[r.choice]}" (${r.correct ? 'right' : 'wrong'})`
            : 'not answered yet';
          return `Check: ${q.question}\nOptions: ${q.options.join(' | ')}\n${picked}`;
        })
        .join('\n');
    }
    if (i.type === 'ask') return `Question: ${i.prompt}\n${i.answeredAt ? `His answer: ${i.response ?? ''}` : 'Not answered yet.'}`;
    return '';
  }
</script>

<div class="chat">
  <div class="msgs" bind:this={list}>
    {#if messages === null}
      <p class="hint">Loading…</p>
    {:else if messages.length === 0 && !draft}
      <div class="empty">
        <p class="empty-t">Talk with Aristotle</p>
        <p class="hint">
          Ask anything, about this step or not. It sees what you're reading, and answers even while a question waits for you. The lesson
          carries on untouched.
        </p>
      </div>
    {/if}
    {#each messages ?? [] as m (m.id)}
      <div class="msg {m.role}">
        {#if m.role === 'user'}
          <p class="mine">{m.text}</p>
        {:else}
          <div class="theirs">{@html renderMarkdown(m.text)}</div>
        {/if}
      </div>
    {/each}
    {#if draft}
      <div class="msg assistant"><div class="theirs">{@html renderMarkdown(draft.text)}</div></div>
    {:else if sending}
      <p class="thinking"><span class="dot" aria-hidden="true"></span>Thinking…</p>
    {/if}
  </div>

  <div class="compose">
    {#if error}<p class="err">{error}</p>{/if}
    <textarea bind:this={box} bind:value={text} onkeydown={onKey} rows="1" placeholder="Ask anything…" aria-label="Message Aristotle"
    ></textarea>
    <p class="where" title="What Aristotle sees with your message">Sees: {where}</p>
  </div>
</div>

<style>
  .chat {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }

  .msgs {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 4px 2px 12px;
  }

  .empty {
    margin: auto 0;
    padding: 0 4px;
    text-align: center;
  }

  .empty-t {
    margin: 0 0 4px;
    font-weight: 600;
    color: var(--fg);
  }

  .hint {
    margin: 0;
    font-size: 0.84rem;
    line-height: 1.55;
    color: var(--faint);
  }

  .msg.user {
    align-self: flex-end;
    max-width: 88%;
  }

  .mine {
    margin: 0;
    padding: 8px 12px;
    border-radius: 14px 14px 4px 14px;
    background: var(--acc-soft);
    color: var(--fg);
    font-size: 0.9rem;
    line-height: 1.55;
    white-space: pre-wrap;
  }

  .theirs {
    color: var(--fg-2);
    font-size: 0.9rem;
    line-height: 1.65;
  }

  .theirs :global(p) {
    margin: 0 0 8px;
  }

  .theirs :global(p:last-child) {
    margin-bottom: 0;
  }

  .theirs :global(ul),
  .theirs :global(ol) {
    margin: 0 0 8px;
    padding-left: 1.2em;
  }

  .thinking {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 0.85rem;
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

  .compose {
    padding-top: 10px;
  }

  textarea {
    display: block;
    width: 100%;
    resize: none;
    padding: 10px 14px;
    border: 1px solid var(--rule);
    border-radius: 12px;
    background: var(--b0);
    color: var(--fg);
    font: 0.92rem / 1.5 var(--sans);
    transition:
      border-color 0.2s,
      box-shadow 0.2s;
  }

  textarea:focus {
    outline: none;
    border-color: var(--acc-line);
    box-shadow: 0 2px 14px -6px rgb(0 0 0 / 0.18);
  }

  .where {
    margin: 6px 4px 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.72rem;
    color: var(--faint);
  }

  .err {
    margin: 0 0 6px;
    font-size: 0.8rem;
    color: var(--wrong);
  }
</style>
