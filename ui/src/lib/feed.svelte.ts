// Live copy of the server's session feed, kept current over Server-Sent Events.

import type { FeedEvent, FeedState, PublicItem, Session } from '../../../shared/types.ts';

class LiveFeed {
  session = $state<Session | null>(null);
  items = $state<PublicItem[]>([]);
  connected = $state(false);

  /** The first question still waiting for the learner, if any. */
  pending = $derived(this.items.find((i) => i.type !== 'block' && !i.answeredAt) ?? null);

  private source: EventSource | null = null;

  start() {
    this.source = new EventSource('/api/events');
    // Reload the whole state on every (re)connect, so nothing is missed while disconnected.
    this.source.onopen = () => void this.reload();
    this.source.onerror = () => (this.connected = false);
    this.source.onmessage = (e) => this.apply(JSON.parse(e.data) as FeedEvent);
  }

  private async reload() {
    const res = await fetch('/api/state');
    const state = (await res.json()) as FeedState;
    this.session = state.session;
    this.items = state.items;
    this.connected = true;
  }

  private apply(event: FeedEvent) {
    if (event.type === 'session') {
      this.session = event.session;
      this.items = [];
    } else {
      this.upsert(event.item);
    }
  }

  upsert(item: PublicItem) {
    const i = this.items.findIndex((x) => x.id === item.id);
    if (i === -1) this.items.push(item);
    else this.items[i] = item;
  }

  async answer(body: unknown): Promise<string | null> {
    const res = await fetch('/api/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return (data as { error?: string }).error ?? 'Could not send the answer';
    this.upsert(data as PublicItem);
    return null;
  }
}

export const feed = new LiveFeed();
