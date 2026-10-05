// Glossing a phrase he selected: asks the server (which asks Claude Code), and keeps a card pinned to the
// selection while the answer is on its way, then with the answer. HoverCard.svelte draws the pinned card;
// Markdown.svelte marks the phrase wherever it appears once the gloss exists.

import type { Gloss } from '../../../shared/types.ts';

/** What the pinned card hangs from: the selection, then the marked phrase once it is a gloss. Read on every layout. */
export type Anchor = { getBoundingClientRect(): DOMRect; getClientRects(): DOMRectList | DOMRect[] };

export type Pinned = {
  text: string;
  anchor: Anchor;
} & ({ state: 'loading' } | { state: 'error'; error: string } | { state: 'done'; gloss: Gloss });

class Glossing {
  pinned = $state<Pinned | null>(null);

  /** Explains `text`, found in `context`, on `topic`'s page. The card shows it as soon as the answer comes. */
  async ask(text: string, anchor: Anchor, context?: string, topic?: string) {
    const pin: Pinned = { text, anchor, state: 'loading' };
    this.pinned = pin;
    let next: Pinned;
    try {
      const res = await fetch('/api/glosses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, context, topic }),
      });
      const data = await res.json();
      next = res.ok
        ? { text, anchor, state: 'done', gloss: data as Gloss }
        : { text, anchor, state: 'error', error: data.error ?? 'Could not gloss it' };
    } catch {
      next = { text, anchor, state: 'error', error: 'Aristotle is not reachable' };
    }
    // Only if the card is still this one: he may have closed it, or asked about something else meanwhile.
    if (this.pinned?.text === pin.text && this.pinned.state === 'loading') this.pinned = next;
  }

  /** Hangs the card from another element: the phrase, once Markdown.svelte has marked it. */
  reanchor(anchor: Anchor) {
    if (this.pinned) this.pinned = { ...this.pinned, anchor };
  }

  /** Forgets a gloss, so the phrase is plain text again. */
  async remove(id: string) {
    await fetch(`/api/glosses/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (this.pinned?.state === 'done' && this.pinned.gloss.id === id) this.pinned = null;
  }

  close() {
    this.pinned = null;
  }
}

export const glossing = new Glossing();
