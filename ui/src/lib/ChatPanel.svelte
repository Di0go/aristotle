<script lang="ts">
  // The chat beside a lesson: the core's chat (@organon/core/ui/ChatPanel.svelte: talk with Aristotle about anything
  // while reading, the answer streaming in and stoppable, even while a question waits, one conversation per class that
  // stays with it and can be cleared). What is Aristotle's: where he is (the class and the step), what is on his screen
  // (the step's text, his answers so far), the step it is about, and what he can tag with @ (a step, a concept, a
  // class).
  import CoreChatPanel, { type Mention } from '@organon/core/ui/ChatPanel.svelte';
  import { classes } from './classes.svelte.ts';
  import { feed } from './feed.svelte.ts';
  import { markOf, outline } from './library.ts';
  import { renderMarkdown } from './markdown.ts';
  import { pageLabel, type ClassPage } from './steps.ts';
  import Logo from './Logo.svelte';
  import type { PublicItem } from '../../../shared/types.ts';

  let { thread, title, page = null }: { thread: string; title: string; page?: ClassPage | null } = $props();

  const MAX_PAGE = 9000;

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
        `Concept "${c.label}" (${markOf(c)} on their map)${c.summary ? `: ${c.summary}` : ''}${c.note ? `\nWhat to watch: ${c.note}` : ''}${c.deps.length ? `\nBuilds on: ${c.deps.join(', ')}` : ''}`,
    }));
    const others: Mention[] = Object.values(feed.topics).map((t) => ({
      label: t.title,
      kind: 'Class',
      hint: `${t.concepts.filter((c) => c.status === 'solid').length}/${t.concepts.length} solid`,
      context: () => `The class "${t.title}": ${t.goal}\nIts concepts: ${t.concepts.map((c) => `${c.label} (${markOf(c)})`).join(', ')}`,
    }));
    return [...steps, ...concepts, ...others];
  });
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
              ? "they said they didn't know"
              : `they picked "${q.options[r.choice]}" (${r.correct ? 'right' : 'wrong'})`
            : 'not answered yet';
          return `Check: ${q.question}\nOptions: ${q.options.join(' | ')}\n${picked}`;
        })
        .join('\n');
    }
    if (i.type === 'ask') return `Question: ${i.prompt}\n${i.answeredAt ? `Their answer: ${i.response ?? ''}` : 'Not answered yet.'}`;
    return '';
  }
</script>

<CoreChatPanel
  chats={feed.chats}
  {thread}
  {title}
  where={() => where}
  placeholder={page ? `Ask about ${pageLabel(page).toLowerCase()}…` : `Ask about ${title}…`}
  page={() => (page ? screen(page) : '')}
  step={() => page?.items.find((i) => i.type === 'block' && i.kind === 'step')?.id}
  name="Aristotle"
  markdown={renderMarkdown}
  mentions={() => mentionables}
>
  {#snippet avatar(size: number)}<Logo {size} />{/snippet}
</CoreChatPanel>
