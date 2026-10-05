// Live copy of the server's state, kept current over Server-Sent Events.

import {
  isInteractive,
  type FeedEvent,
  type FeedState,
  type Mission,
  type PublicItem,
  type Roadmap,
  type Session,
  type Topic,
} from '../../../shared/types.ts';

class LiveFeed {
  session = $state<Session | null>(null);
  items = $state<PublicItem[]>([]);
  connected = $state(false);
  /** Every topic in full, by slug, updated live. */
  topics = $state<Record<string, Topic>>({});
  /** False until the first full load, so pages can tell "loading" from "none". */
  loaded = $state(false);
  /** He asked to stop for today; cleared when the session ends. */
  wrapping = $state(false);
  /** Something was started from the interface and its session hasn't appeared yet. */
  starting = $state<{ label: string; at: number; after: string | null } | null>(null);
  /** Bumped on every topic change, so pages can refetch summaries. */
  topicVersion = $state(0);
  /** Every roadmap, by slug, updated live. Null until loaded. */
  roadmaps = $state<Record<string, Roadmap> | null>(null);
  /** Every Praxis mission, by id, updated live. Null until loaded. */
  missions = $state<Record<string, Mission> | null>(null);

  /** The first question still waiting for the learner, if any. Once a session has ended, nothing is. */
  pending = $derived(this.session?.endedAt ? null : (this.items.find((i) => isInteractive(i) && !i.answeredAt) ?? null));
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
    const all = (await (await fetch('/api/map')).json()) as Topic[];
    const roadmaps = (await (await fetch('/api/roadmaps')).json()) as Roadmap[];
    const missions = (await (await fetch('/api/missions')).json()) as Mission[];
    this.topics = Object.fromEntries(all.map((t) => [t.slug, t]));
    this.roadmaps = Object.fromEntries(roadmaps.map((r) => [r.slug, r]));
    this.missions = Object.fromEntries(missions.map((m) => [m.id, m]));
    this.loaded = true;
    this.topicVersion++;
  }

  /** Missions, newest first. */
  missionList = $derived(Object.values(this.missions ?? {}).sort((a, b) => b.created.localeCompare(a.created)));

  /** Sends his debrief, or drops or restores a mission. Returns an error message, or null. */
  async mission(id: string, body: { action: 'debrief'; text: string } | { action: 'drop' | 'restore' }): Promise<string | null> {
    const res = await fetch(`/api/missions/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return (data as { error?: string }).error ?? 'Could not save it';
    this.missions = { ...this.missions, [id]: data as Mission };
    return null;
  }

  /** Roadmaps, most recently changed first. */
  roadmapList = $derived(Object.values(this.roadmaps ?? {}).sort((a, b) => b.updated.localeCompare(a.updated)));

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
      if (event.session.endedAt) this.wrapping = false;
      if (changed) {
        this.items = [];
        this.starting = null;
        if (event.session.topicSlug && !this.topics[event.session.topicSlug]) void this.loadTopic(event.session.topicSlug);
      }
    } else if (event.type === 'topic') {
      this.topics[event.topic.slug] = event.topic;
      this.topicVersion++;
    } else if (event.type === 'roadmap') {
      this.roadmaps = { ...this.roadmaps, [event.roadmap.slug]: event.roadmap };
    } else if (event.type === 'mission') {
      this.missions = { ...this.missions, [event.mission.id]: event.mission };
    } else {
      this.upsert(event.item);
    }
  }

  /** Marks that something was asked of Claude, so Now can say so until the session starts. */
  begin(label: string) {
    this.starting = { label, at: Date.now(), after: this.session?.id ?? null };
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
