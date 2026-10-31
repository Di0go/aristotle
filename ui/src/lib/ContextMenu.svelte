<script lang="ts">
  // The menu on right-clicking selected text: the core's (@organon/core/ui/ContextMenu.svelte: copy it, search for it
  // in Aristotle; Shift, a text box or the terminal keep the browser's own menu), with Aristotle's own two: gloss it
  // (Claude Code explains it in a hover card, which then shows wherever the phrase appears), or ask a question about
  // it (answered beside the step, kept with it).
  import CoreContextMenu, { type MenuItem } from '@organon/core/ui/ContextMenu.svelte';
  import { asides } from './aside.svelte.ts';
  import { feed } from './feed.svelte.ts';
  import { glossing } from './gloss.svelte.ts';
  import { router } from './router.svelte.ts';

  /** As server/glosses.ts: longer is a passage, not a phrase. */
  const MAX_PHRASE = 120;
  /** The block a selection sits in, for the gloss's context. */
  const BLOCK = 'p, li, td, th, dd, dt, blockquote, figcaption, h1, h2, h3, h4, h5, h6';

  /** Gloss and Ask, on selected text: the selection read here, its range copied (it moves with whatever he clicks next). */
  function actions(): MenuItem[] {
    const sel = getSelection();
    const text = sel?.toString().replace(/\s+/g, ' ').trim() ?? '';
    if (!text || !sel?.rangeCount) return [];
    const range = sel.getRangeAt(0).cloneRange();
    return [
      {
        label: 'Gloss',
        hint: 'Explain it',
        run: () => gloss(text, range),
        disabled: text.length > MAX_PHRASE ? 'Select a word or a short phrase to gloss it' : undefined,
      },
      { label: 'Ask about this', hint: 'A question', run: () => ask(text, range) },
    ];
  }

  /** Asks for the gloss, with the sentence around it and the topic being read, and pins its card under the selection. */
  function gloss(text: string, range: Range) {
    void glossing.ask(text, range, elementOf(range)?.closest(BLOCK)?.textContent ?? undefined, topicHere());
  }

  /** Opens the question panel by the selection, tied to the lesson item it is in. */
  function ask(text: string, range: Range) {
    const el = elementOf(range);
    const item = el?.closest<HTMLElement>('.notebook > .entry')?.id.replace(/^item-/, '') || undefined;
    asides.start(text, range, topicHere(), item, el?.closest(BLOCK)?.textContent ?? undefined);
  }

  function elementOf(range: Range): Element | null {
    const node = range.commonAncestorContainer;
    return node instanceof Element ? node : node.parentElement;
  }

  /** The topic being read: the page's, or the lesson running now. */
  function topicHere(): string | undefined {
    const route = router.route;
    return route.page === 'topic' || route.page === 'lesson' || route.page === 'step' ? route.slug : (feed.liveSlug ?? undefined);
  }
</script>

<CoreContextMenu app="Aristotle" {actions} />
