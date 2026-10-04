// Live copy of the server's state, kept current over Server-Sent Events.

import {
  isInteractive,
  type FeedEvent,
  type FeedState,
  type PublicItem,
  type Session,
  type Topic,
} from '../../../shared/types.ts';

class LiveFeed {
  session = $state<Session | null>(null);
  items = $state<PublicItem[]>([]);
  connected = $state(false);
  /** Full topics seen so far, by slug, updated live. */
  topics = $state<Record<string, Topic>>({});
  /** Bumped on every topic change, so pages can refetch summaries. */
  topicVersion = $state(0);

  /** The first question still waiting for the learner, if any. */
  pending = $derived(this.items.find((i) => isInteractive(i) && !i.answeredAt) ?? null);
  currentTopic = $derived(this.session ? (this.topics[this.session.topicSlug] ?? null) : null);

  private source: EventSource | null = null;

  start() {
    this.source = new EventSource('/api/events');
    // Reload the whole state on every (re)connect, so nothing is missed while disconnected.
    this.source.onopen = () => void this.reload();
    this.source.onerror = () => (this.connected = false);
    this.source.onmessage = (e) => this.apply(JSON.parse(e.data) as FeedEvent);
  }

  private async reload() {
    const state = (await (await fetch('/api/state')).json()) as FeedState;
    this.session = state.session;
    this.items = state.items;
    this.connected = true;
    if (state.session) await this.loadTopic(state.session.topicSlug);
    this.topicVersion++;
  }

  async loadTopic(slug: string): Promise<Topic | null> {
    const res = await fetch(`/api/topics/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const topic = (await res.json()) as Topic;
    this.topics[slug] = topic;
    return topic;
  }

  private apply(event: FeedEvent) {
    if (event.type === 'session') {
      const changed = event.session.id !== this.session?.id;
      this.session = event.session;
      if (changed) {
        this.items = [];
        void this.loadTopic(event.session.topicSlug);
      }
    } else if (event.type === 'topic') {
      this.topics[event.topic.slug] = event.topic;
      this.topicVersion++;
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
