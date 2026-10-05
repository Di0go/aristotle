// Live copy of the server's state, kept current over Server-Sent Events.

import {
  isInteractive,
  type FeedEvent,
  type FeedState,
  type Gloss,
  type Mission,
  type PublicItem,
  type Roadmap,
  type Session,
  type SessionSummary,
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
  /**
   * A lesson asked for from here, to be taken to once it starts: a topic's slug, or "*" when its topic isn't known
   * yet (a new one). Whichever page sees it start takes him there and clears it.
   */
  follow = $state<string | null>(null);
  /** Something was started from the interface and its session hasn't appeared yet. */
  starting = $state<{ label: string; at: number; after: string | null } | null>(null);
  /** Bumped on every topic change, so pages can refetch summaries. */
  topicVersion = $state(0);
  /** Every roadmap, by slug, updated live. Null until loaded. */
  roadmaps = $state<Record<string, Roadmap> | null>(null);
  /** Every Praxis mission, by id, updated live. Null until loaded. */
  missions = $state<Record<string, Mission> | null>(null);

  /** Every phrase he has had explained, updated live. */
  glosses = $state<Gloss[]>([]);

  /** The first question still waiting for the learner, if any. Once a session has ended, nothing is. */
  pending = $derived(this.session?.endedAt ? null : (this.items.find((i) => isInteractive(i) && !i.answeredAt) ?? null));
  /** The topic of the lesson running right now, or null when none is. */
  liveSlug = $derived(this.session && !this.session.endedAt ? this.session.topicSlug : null);
  currentTopic = $derived(this.session ? (this.topics[this.session.topicSlug] ?? null) : null);
  /** Roadmaps, most recently changed first. */
  roadmapList = $derived(Object.values(this.roadmaps ?? {}).sort((a, b) => b.updated.localeCompare(a.updated)));
  /** Missions, newest first. */
  missionList = $derived(Object.values(this.missions ?? {}).sort((a, b) => b.created.localeCompare(a.created)));

  private source: EventSource | null = null;

  start() {
    this.source = new EventSource('/api/events');
    // Reload the whole state on every (re)connect, so nothing is missed while disconnected.
    this.source.onopen = () => void this.reload();
    this.source.onerror = () => (this.connected = false);
    this.source.onmessage = (e) => this.apply(JSON.parse(e.data) as FeedEvent);
  }

  /** Marks that something was asked of Claude, so Home and the class can say so until the session starts. */
  begin(label: string) {
    this.starting = { label, at: Date.now(), after: this.session?.id ?? null };
  }

  async loadTopic(slug: string): Promise<Topic | null> {
    const res = await fetch(`/api/topics/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const topic = (await res.json()) as Topic;
    this.topics[slug] = topic;
    return topic;
  }

  /**
   * Sends his answer to a quiz or an ask. Returns an error message, or whether Claude heard it at once (a tool
   * call was waiting for it) rather than having to be told to collect it.
   */
  async answer(body: unknown): Promise<{ error: string } | { heard: boolean }> {
    const res = await fetch('/api/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { error: (data as { error?: string }).error ?? 'Could not send the answer' };
    this.upsert(data as PublicItem);
    return { heard: res.headers.get('X-Aristotle-Heard') === 'yes' };
  }

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

  /** Adds an item to the session, or replaces it in place when it is already there (an answered question). */
  upsert(item: PublicItem) {
    const i = this.items.findIndex((x) => x.id === item.id);
    if (i === -1) this.items.push(item);
    else this.items[i] = item;
  }

  private async reload() {
    const state = await getJson<FeedState>('/api/state');
    this.session = state.session;
    this.items = state.items;
    this.connected = true;
    const topics = await getJson<Topic[]>('/api/map');
    const roadmaps = await getJson<Roadmap[]>('/api/roadmaps');
    const missions = await getJson<Mission[]>('/api/missions');
    this.glosses = await getJson<Gloss[]>('/api/glosses');
    this.topics = Object.fromEntries(topics.map((t) => [t.slug, t]));
    this.roadmaps = Object.fromEntries(roadmaps.map((r) => [r.slug, r]));
    this.missions = Object.fromEntries(missions.map((m) => [m.id, m]));
    this.loaded = true;
    this.topicVersion++;
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
    } else if (event.type === 'glosses') {
      this.glosses = event.glosses;
    } else {
      this.upsert(event.item);
    }
  }
}

export const feed = new LiveFeed();

/** Summaries of every session on a topic, newest first. */
export async function topicSessions(slug: string): Promise<SessionSummary[]> {
  return (await getJson<SessionSummary[]>('/api/sessions')).filter((s) => s.topicSlug === slug);
}

async function getJson<T>(url: string): Promise<T> {
  return (await (await fetch(url)).json()) as T;
}
