<script lang="ts">
  // The chat beside a lesson: talk with Aristotle about anything while reading. Each message goes with where he is
  // and what is on his screen, plus whatever he tags with @ (a step, a concept, a class), so he never has to explain;
  // the answer streams in as it is written and can be stopped, even while a question waits for him, and the lesson
  // carries on untouched. One conversation per class: it stays with the class (leave and come back, it is there),
  // and he can clear it to start over.
  import { tick } from 'svelte';
  import { classes } from './classes.svelte.ts';
  import { feed } from './feed.svelte.ts';
  import { formatTime } from './format.ts';
  import { markOf, outline } from './library.ts';
  import { renderMarkdown } from './markdown.ts';
  import { pageLabel, type ClassPage } from './steps.ts';
  import Logo from './Logo.svelte';
  import type { PublicItem } from '../../../shared/types.ts';

  let { thread, title, page = null }: { thread: string; title: string; page?: ClassPage | null } = $props();

  type Mention = { label: string; kind: 'Step' | 'Concept' | 'Class'; hint: string; context: () => string };

  const MAX_PAGE = 9000;

  let text = $state('');
  let sending = $state(false);
  let error = $state<string | null>(null);
  let confirmClear = $state(false);
  let list = $state<HTMLElement>();
  let box = $state<HTMLTextAreaElement>();
  /** What he has tagged in the message being written. */
  let tagged = $state<Mention[]>([]);
  /** The @ being typed: where it starts in the text, and what follows it so far. */
  let picking = $state<{ at: number; query: string } | null>(null);
  let picked = $state(0);

  const messages = $derived(feed.chats[thread] ?? null);
  const draft = $derived(feed.chatDrafts[thread] ?? null);
  const where = $derived(page ? `${title} · ${pageLabel(page)}${page.title ? `: ${page.title}` : ''}` : title);
  /** Everything he can tag: this class's steps and concepts, then every class. */
  const mentionables = $derived.by((): Mention[] => {
    const topic = feed.topics[thread];
    const pages = classes.pages(thread) ?? [];
    const steps: Mention[] = pages.map((p) => ({
      label: `${pageLabel(p)}${p.title ? ` · ${p.title}` : ''}`,
      kind: 'Step',
      hint: title,
      context: () => `${pageLabel(p)}${p.title ? ` · ${p.title}` : ''} (of ${title}):\n${screen(p)}`,
    }));
    const concepts: Mention[] = (topic ? outline(topic) : []).map((c) => ({
      label: c.label,
      kind: 'Concept',
      hint: { solid: 'solid', fading: 'fading', shaky: 'shaky', unknown: 'not yet' }[markOf(c)],
      context: () =>
        `Concept "${c.label}" (${markOf(c)} on his map)${c.summary ? `: ${c.summary}` : ''}${c.note ? `\nWhat to watch: ${c.note}` : ''}${c.deps.length ? `\nBuilds on: ${c.deps.join(', ')}` : ''}`,
    }));
    const others: Mention[] = Object.values(feed.topics).map((t) => ({
      label: t.title,
      kind: 'Class',
      hint: `${t.concepts.filter((c) => c.status === 'solid').length}/${t.concepts.length} solid`,
      context: () => `The class "${t.title}": ${t.goal}\nIts concepts: ${t.concepts.map((c) => `${c.label} (${markOf(c)})`).join(', ')}`,
    }));
    return [...steps, ...concepts, ...others];
  });
  const options = $derived.by(() => {
    if (!picking) return [];
    const q = picking.query.toLowerCase();
    return mentionables.filter((m) => m.label.toLowerCase().includes(q)).slice(0, 8);
  });

  $effect(() => {
    void feed.loadChat(thread);
  });

  // Keep the newest message in view as the conversation grows and an answer streams in.
  $effect(() => {
    void messages?.length;
    void draft?.text;
    void sending;
    void tick().then(() => list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' }));
  });

  // The box grows with what he writes, up to a few lines.
  $effect(() => {
    void text;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 200)}px`;
  });

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    sending = true;
    error = null;
    const mentions = tagged.filter((m) => body.includes(`@${m.label}`));
    text = '';
    tagged = [];
    picking = null;
    const step = page?.items.find((i) => i.type === 'block' && i.kind === 'step')?.id;
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(thread)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: body,
          where,
          page: page ? screen(page) : undefined,
          step,
          mentions: mentions.map((m) => m.context()).join('\n\n') || undefined,
          tags: mentions.map((m) => `@${m.label}`),
        }),
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

  /** Stops the answer being written; what it said so far stays. */
  function stop() {
    void fetch(`/api/chats/${encodeURIComponent(thread)}/answer`, { method: 'DELETE' });
  }

  async function clear() {
    confirmClear = false;
    await fetch(`/api/chats/${encodeURIComponent(thread)}`, { method: 'DELETE' });
  }

  function onKey(e: KeyboardEvent) {
    if (picking && options.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        picked = (picked + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length;
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        choose(options[picked]);
        return;
      }
    }
    if (e.key === 'Escape' && picking) {
      e.preventDefault();
      picking = null;
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  /** Watches for an @ being typed: from it to the caret is what he is looking for. */
  function onInput() {
    const caret = box?.selectionStart ?? text.length;
    const before = text.slice(0, caret);
    const at = before.lastIndexOf('@');
    const q = at === -1 ? '' : before.slice(at + 1);
    const starts = at !== -1 && (at === 0 || /\s/.test(before[at - 1]));
    picking = starts && !q.includes('\n') && q.length <= 40 ? { at, query: q } : null;
    picked = 0;
  }

  /** Puts the tag in the text, where the @ was, and remembers what it stands for. */
  function choose(m: Mention) {
    if (!picking) return;
    const caret = picking.at + 1 + picking.query.length;
    text = `${text.slice(0, picking.at)}@${m.label} ${text.slice(caret)}`;
    if (!tagged.some((t) => t.label === m.label)) tagged = [...tagged, m];
    const pos = picking.at + m.label.length + 2;
    picking = null;
    void tick().then(() => {
      box?.focus();
      box?.setSelectionRange(pos, pos);
    });
  }

  /** Opens the tag list from the @ button. */
  function startTag() {
    const add = text && !/\s$/.test(text) ? ' @' : '@';
    text += add;
    void tick().then(() => {
      box?.focus();
      box?.setSelectionRange(text.length, text.length);
      onInput();
    });
  }

  /** His message with what he tagged shown as chips. */
  function withChips(t: string, mentions: string[] = []): string {
    let html = t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
    for (const m of [...mentions].sort((a, b) => b.length - a.length)) {
      const safe = m.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
      html = html.split(safe).join(`<span class="tag-chip">${safe}</span>`);
    }
    return html;
  }

  async function copy(t: string) {
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      // Not on plain http; nothing else to do.
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
  <header class="chat-head">
    <span class="avatar" aria-hidden="true"><Logo size={16} /></span>
    <div class="who">
      <span class="name">Aristotle</span>
      <span class="sub">Chat about {title}</span>
    </div>
    {#if messages?.length}
      {#if confirmClear}
        <span class="confirm">
          Clear this chat?
          <button class="link danger" onclick={clear}>Clear</button>
          <button class="link" onclick={() => (confirmClear = false)}>Keep</button>
        </span>
      {:else}
        <button class="link quiet" onclick={() => (confirmClear = true)} title="Start this class's chat over">Clear</button>
      {/if}
    {/if}
  </header>

  <div class="msgs" bind:this={list}>
    {#if messages === null}
      <p class="hint">Loading…</p>
    {:else if messages.length === 0 && !draft && !sending}
      <div class="empty">
        <span class="big-avatar" aria-hidden="true"><Logo size={26} /></span>
        <p class="empty-t">Ask Aristotle anything</p>
        <p class="hint">About this step or not. It sees what you're reading; tag a step or a concept with <kbd>@</kbd>.</p>
      </div>
    {/if}

    {#each messages ?? [] as m (m.id)}
      {#if m.role === 'user'}
        <div class="msg mine">
          <p class="bubble">{@html withChips(m.text, m.mentions)}</p>
        </div>
      {:else}
        <div class="msg theirs">
          <span class="avatar" aria-hidden="true"><Logo size={14} /></span>
          <div class="body">
            <div class="answer">{@html renderMarkdown(m.text)}</div>
            <div class="meta">
              <span>{formatTime(m.at)}</span>
              {#if m.stopped}<span class="stopped">stopped</span>{/if}
              <button class="link quiet" onclick={() => void copy(m.text)}>Copy</button>
            </div>
          </div>
        </div>
      {/if}
    {/each}

    {#if draft}
      <div class="msg theirs">
        <span class="avatar" aria-hidden="true"><Logo size={14} /></span>
        <div class="body"><div class="answer streaming">{@html renderMarkdown(draft.text)}</div></div>
      </div>
    {:else if sending}
      <div class="msg theirs">
        <span class="avatar" aria-hidden="true"><Logo size={14} /></span>
        <div class="body"><span class="typing" aria-label="Aristotle is thinking"><i></i><i></i><i></i></span></div>
      </div>
    {/if}
  </div>

  <div class="compose">
    {#if picking && options.length}
      <ul class="picker" role="listbox" aria-label="Tag something">
        {#each options as o, i (o.kind + o.label)}
          <li role="option" aria-selected={i === picked}>
            <button class:on={i === picked} onmousedown={(e) => e.preventDefault()} onclick={() => choose(o)}>
              <span class="k">{o.kind}</span><span class="l">{o.label}</span><span class="h">{o.hint}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if error}<p class="err">{error}</p>{/if}
    <div class="box">
      <button class="tool" onclick={startTag} title="Tag a step, a concept or a class" aria-label="Tag a step, a concept or a class"
        >@</button
      >
      <textarea
        bind:this={box}
        bind:value={text}
        oninput={onInput}
        onkeydown={onKey}
        rows="1"
        placeholder={page ? `Ask about ${pageLabel(page).toLowerCase()}…` : `Ask about ${title}…`}
        aria-label="Message Aristotle"></textarea>
      {#if sending}
        <button class="send stop" onclick={stop} title="Stop the answer" aria-label="Stop the answer">
          <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" rx="1.5" /></svg>
        </button>
      {:else}
        <button class="send" onclick={() => void send()} disabled={!text.trim()} title="Send (Enter)" aria-label="Send">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 12.5V3.5M4.25 7.25L8 3.5l3.75 3.75" /></svg>
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .chat {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .chat-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--rule);
  }

  .avatar {
    flex: none;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--b0);
    border: 1px solid var(--rule);
    color: var(--acc);
  }

  .who {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    line-height: 1.25;
  }

  .name {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--fg);
  }

  .sub {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.74rem;
    color: var(--faint);
  }

  .quiet {
    font-size: 0.76rem;
    color: var(--faint);
  }

  .quiet:hover {
    color: var(--fg);
    text-decoration: none;
  }

  .confirm {
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 0.76rem;
    color: var(--muted);
  }

  .confirm .link {
    font-size: inherit;
  }

  .danger {
    color: var(--wrong);
  }

  .msgs {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 16px 2px 14px;
  }

  .empty {
    display: grid;
    justify-items: center;
    gap: 6px;
    margin: auto 0;
    padding: 0 10px;
    text-align: center;
  }

  .big-avatar {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--acc-soft);
    color: var(--acc);
    margin-bottom: 4px;
  }

  .empty-t {
    margin: 0;
    font-weight: 600;
    color: var(--fg);
  }

  .hint {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.55;
    color: var(--faint);
  }

  .msg.mine {
    align-self: flex-end;
    max-width: 90%;
  }

  .bubble {
    margin: 0;
    padding: 9px 13px;
    border-radius: 16px 16px 4px 16px;
    background: var(--acc);
    color: var(--on-acc);
    font-size: 0.9rem;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .bubble :global(.tag-chip) {
    padding: 0 5px;
    border-radius: 5px;
    background: rgb(255 255 255 / 0.22);
    font-weight: 600;
  }

  .msg.theirs {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .msg.theirs .avatar {
    width: 24px;
    height: 24px;
    margin-top: 1px;
  }

  .body {
    flex: 1;
    min-width: 0;
  }

  .answer {
    color: var(--fg-2);
    font-size: 0.9rem;
    line-height: 1.65;
    overflow-wrap: anywhere;
  }

  .answer :global(p) {
    margin: 0 0 8px;
  }

  .answer :global(p:last-child) {
    margin-bottom: 0;
  }

  .answer :global(strong) {
    color: var(--fg);
  }

  .answer :global(ul),
  .answer :global(ol) {
    margin: 0 0 8px;
    padding-left: 1.2em;
  }

  .answer.streaming > :global(*:last-child)::after {
    content: '';
    display: inline-block;
    width: 7px;
    height: 0.95em;
    margin-left: 2px;
    vertical-align: -0.1em;
    background: var(--acc);
    animation: blink 1s steps(2) infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  .meta {
    display: flex;
    gap: 10px;
    margin-top: 4px;
    font-size: 0.72rem;
    color: var(--faint);
    opacity: 0;
    transition: opacity 0.15s;
  }

  .msg.theirs:hover .meta,
  .meta:has(.stopped) {
    opacity: 1;
  }

  .meta .link {
    font-size: inherit;
  }

  .stopped {
    color: var(--shaky);
  }

  .typing {
    display: inline-flex;
    gap: 4px;
    padding: 9px 0;
  }

  .typing i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--faint);
    animation: bounce 1.2s ease-in-out infinite;
  }

  .typing i:nth-child(2) {
    animation-delay: 0.15s;
  }

  .typing i:nth-child(3) {
    animation-delay: 0.3s;
  }

  @keyframes bounce {
    0%,
    60%,
    100% {
      transform: none;
      opacity: 0.4;
    }

    30% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }

  .compose {
    position: relative;
    padding-top: 8px;
  }

  /* One calm row: @ on the left, the text in the middle, send on the right, all on the first line's centre as the
     box grows. Send is a round button in the text colour that keeps its place and shape: faint until there is
     something to send, solid when there is; Stop takes its place while Aristotle writes. */
  .box {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    padding: 5px;
    border: 1px solid var(--rule);
    border-radius: 14px;
    background: var(--b0);
    transition: border-color 0.15s;
  }

  .box:focus-within {
    border-color: var(--acc-line);
  }

  textarea {
    flex: 1;
    min-width: 0;
    display: block;
    resize: none;
    padding: 6px 4px;
    border: 0;
    background: none;
    color: var(--fg);
    font: 0.92rem / 1.5 var(--sans);
  }

  textarea::placeholder {
    color: var(--faint);
  }

  textarea:focus {
    outline: none;
  }

  .tool,
  .send {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    margin-bottom: 2px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
  }

  .tool {
    background: none;
    color: var(--faint);
    font: 500 0.95rem var(--sans);
    transition:
      background-color 0.15s,
      color 0.15s;
  }

  .tool:hover {
    background: var(--hover);
    color: var(--fg);
  }

  .send {
    background: var(--fg);
    color: var(--b0);
    transition:
      opacity 0.15s,
      transform 0.1s;
  }

  .send:disabled {
    opacity: 0.18;
    cursor: default;
  }

  .send:not(:disabled):hover {
    opacity: 0.85;
  }

  .send:not(:disabled):active {
    transform: scale(0.92);
  }

  .send svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .send.stop svg {
    width: 12px;
    height: 12px;
    fill: currentColor;
    stroke: none;
  }

  .picker {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% - 4px);
    z-index: 5;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--b0);
    border: 1px solid var(--rule);
    border-radius: 12px;
    box-shadow: var(--shadow);
  }

  .picker button {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--fg);
    font: 0.85rem var(--sans);
    text-align: left;
    cursor: pointer;
  }

  .picker button.on {
    background: var(--acc-soft);
  }

  .picker .k {
    flex: none;
    width: 3.8rem;
    font-size: 0.7rem;
    color: var(--faint);
  }

  .picker .l {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picker .h {
    flex: none;
    font-size: 0.72rem;
    color: var(--faint);
  }

  .err {
    margin: 0 0 6px;
    font-size: 0.8rem;
    color: var(--wrong);
  }
</style>
