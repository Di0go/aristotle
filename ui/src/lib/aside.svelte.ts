// "Ask about this": a question on a passage he selected, asked in a small panel by the passage and answered by
// Claude Code beside the step, without interrupting the class. AskPanel.svelte draws it; the step's page keeps the
// answered questions under the step.

import type { Anchor } from './gloss.svelte.ts';
import type { Aside } from '../../../shared/types.ts';

export interface Asking {
  passage: string;
  anchor: Anchor;
  topic?: string;
  /** The feed item the passage is in. */
  item?: string;
  /** The paragraph around the passage. */
  context?: string;
  state: 'writing' | 'waiting' | 'answered' | 'error';
  question: string;
  answer?: Aside;
  error?: string;
}

class Asides {
  open = $state<Asking | null>(null);

  /** Opens the panel by the passage, ready for his question. */
  start(passage: string, anchor: Anchor, topic?: string, item?: string, context?: string) {
    this.open = { passage, anchor, topic, item, context, state: 'writing', question: '' };
  }

  async send(question: string) {
    const q = this.open;
    if (!q || !question.trim()) return;
    q.question = question.trim();
    q.state = 'waiting';
    try {
      const res = await fetch('/api/asides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passage: q.passage, question: q.question, context: q.context, topic: q.topic, item: q.item }),
      });
      const data = await res.json();
      if (this.open !== q) return;
      if (res.ok) {
        q.answer = data as Aside;
        q.state = 'answered';
      } else {
        q.error = data.error ?? 'Claude could not answer';
        q.state = 'error';
      }
    } catch {
      if (this.open !== q) return;
      q.error = 'Aristotle is not reachable';
      q.state = 'error';
    }
  }

  /** Another question on the same passage. */
  again() {
    if (this.open) this.open = { ...this.open, state: 'writing', question: '', answer: undefined, error: undefined };
  }

  async remove(id: string) {
    await fetch(`/api/asides/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  close() {
    this.open = null;
  }
}

export const asides = new Asides();
