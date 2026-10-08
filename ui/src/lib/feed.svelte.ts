// Live copy of the server's state, kept current over Server-Sent Events.

import { untrack } from 'svelte';
import {
  isInteractive,
  type FeedEvent,
  type Aside,
  type ChatMessage,
  type StepNote,
  type FeedState,
  type Gloss,
  type Mission,
  type PublicItem,
  type Roadmap,
  type Session,
  type SessionSummary,
  type Topic,
} from '../../../shared/types.ts';

/** How long the feed must be quiet after a change before pages refetch what the server works out from it. */
const SETTLE_MS = 300;

/** Longer than this with nothing happening, an open session is no longer going on (as long as quiz and ask wait). */
const IDLE_MS = 15 * 60_000;

/** Nothing from the live stream for this long (it pings every 20 s) and it is taken for dead, and opened again. */
const STALE_MS = 50_000;

class LiveFeed {
  session = $state<Session | null>(null);
  items = $state<PublicItem[]>([]);
  connected = $state(false);
  /** Every topic, by slug, updated live (each concept with only its newest evidence; see Concept.evidenceTotal). */
  topics = $state<Record<string, Topic>>({});
  /** False until the first full load, so pages can tell "loading" from "none". */
  loaded = $state(false);
  /**
   * A lesson asked for from here, to be taken to once it starts: a topic's slug, or "*" when its topic isn't known
   * yet (a new one). Whichever page sees it start takes him there and clears it.
   */
  follow = $state<string | null>(null);
  /** Something was started from the interface and its session hasn't appeared yet. */
  starting = $state<{ label: string; at: number; after: string | null } | null>(null);
  /** Bumped on every topic change. */
  topicVersion = $state(0);
  /**
   * Bumped once the feed has been quiet for a moment after a topic, session or item changed (one answer can change
   * several topics in a row): what pages refetch server-made summaries on (see `refetching`).
   */
  settled = $state(0);
  /** Every roadmap, by slug, updated live. Null until loaded. */
  roadmaps = $state<Record<string, Roadmap> | null>(null);
  /** Every Praxis mission, by id, updated live. Null until loaded. */
  missions = $state<Record<string, Mission> | null>(null);
  /** Problems he should know about (a backup that keeps failing, a data file skipped as unreadable). */
  warnings = $state<string[]>([]);

  /** Every phrase he has had explained, updated live. */
  glosses = $state<Gloss[]>([]);
  /** Every question he asked on a passage, updated live. */
  asides = $state<Aside[]>([]);
  /** His notebook on every step, updated live. */
  notes = $state<StepNote[]>([]);
  /** What he wrote on his About you page. */
  about = $state('');
  /** The chats beside lessons, by thread (a class's slug, or "home"), loaded when first shown. */
  chats = $state<Record<string, ChatMessage[]>>({});
  /** Aristotle's answer being written, by thread: its id and the text so far. */
  chatDrafts = $state<Record<string, { id: string; text: string }>>({});

  /** The first question still waiting for the learner, if any. Once a session has ended, nothing is. */
  pending = $derived(this.session?.endedAt ? null : (this.items.find((i) => isInteractive(i) && !i.answeredAt) ?? null));
  /** The topic of the lesson running right now, or null when none is. */
  liveSlug = $derived(this.session && !this.session.endedAt ? this.session.topicSlug : null);
  /** When anything last happened in the current session: it started, a step was shown, a question answered. */
  lastActivity = $derived(
    this.session
      ? Math.max(
          Date.parse(this.session.startedAt),
          ...this.items.flatMap((i) => [Date.parse(i.at), isInteractive(i) && i.answeredAt ? Date.parse(i.answeredAt) : 0]),
        )
      : 0,
  );
  /**
   * A sitting is in progress: its session is open and something happened in it lately. A session nobody closed (Claude
   * Code stopped mid-lesson, a question left unanswered for days) stays open on disk, but it is not going on.
   */
  get inProgress(): boolean {
    return this.inProgressAt(Date.now());
  }

  /** inProgress at time `t` (a page with its own clock reads it as the clock ticks). */
  inProgressAt(t: number): boolean {
    return Boolean(this.session && !this.session.endedAt && t - this.lastActivity < IDLE_MS);
  }
  currentTopic = $derived(this.session ? (this.topics[this.session.topicSlug] ?? null) : null);
  /** Roadmaps, most recently changed first. */
  roadmapList = $derived(Object.values(this.roadmaps ?? {}).sort((a, b) => b.updated.localeCompare(a.updated)));
  /** Missions, newest first. */
  missionList = $derived(Object.values(this.missions ?? {}).sort((a, b) => b.created.localeCompare(a.created)));

  private source: EventSource | null = null;
  /** When the live stream was last heard from: an event, a ping, or opening. */
  private heard = 0;
  /** A full reload is in flight: live events wait for it, then are applied on top of it in order. */
  private reloading = false;
  /** The connection came back while reloading: reload once more when this one is done. */
  private again = false;
  private held: FeedEvent[] = [];
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  /** /api/sessions, shared by everyone who asks until a topic, the session or an item changes. */
  private sessionList: Promise<SessionSummary[]> | null = null;

  start() {
    this.open();
    // The browser gives up on a stream for good after some failures, and a connection can die without either end
    // noticing (the machine slept, the network changed): either way the page would sit on a stale sitting while Claude
    // waits on a question it never showed. The server pings every 20 s, so a stream heard from in the last
    // STALE_MS is alive; otherwise it is opened again, which reloads everything.
    const check = () => {
      if (this.source?.readyState === EventSource.CLOSED || Date.now() - this.heard > STALE_MS) this.open();
    };
    setInterval(check, 10_000);
    addEventListener('online', check);
    addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
  }

  private open() {
    this.source?.close();
    const source = new EventSource('/api/events');
    this.source = source;
    this.heard = Date.now();
    // Reload the whole state on every (re)connect, so nothing is missed while disconnected.
    source.onopen = () => {
      this.heard = Date.now();
      void this.reload();
    };
    source.onerror = () => (this.connected = false);
    source.addEventListener('ping', () => (this.heard = Date.now()));
    source.onmessage = (e) => {
      this.heard = Date.now();
      const event = JSON.parse(e.data) as FeedEvent;
      if (this.reloading) this.held.push(event);
      else this.apply(event);
    };
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

  /** Summaries of every session, newest first: one request shared by every page that asks before anything changes. */
  sessions(): Promise<SessionSummary[]> {
    if (!this.sessionList) {
      const list = getJson<SessionSummary[]>('/api/sessions');
      this.sessionList = list;
      list.catch(() => {
        if (this.sessionList === list) this.sessionList = null;
      });
    }
    return this.sessionList;
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

  /** A chat's messages, loaded once; later ones arrive over the live feed. */
  async loadChat(thread: string) {
    if (this.chats[thread]) return;
    this.chats[thread] = await getJson<ChatMessage[]>(`/api/chats/${encodeURIComponent(thread)}`);
  }

  /** Adds an item to the session, or replaces it in place when it is already there (an answered question). */
  upsert(item: PublicItem) {
    const i = this.items.findIndex((x) => x.id === item.id);
    if (i === -1) this.items.push(item);
    else this.items[i] = item;
    this.changed();
  }

  /**
   * Everything at once: fetched side by side and put in place in one go, so pages go from "loading" to the whole
   * picture without passing through empty states. Events that arrive meanwhile are applied after it, in order, so
   * an older snapshot never overwrites them.
   */
  private async reload() {
    if (this.reloading) {
      this.again = true;
      return;
    }
    this.reloading = true;
    this.again = false;
    this.held = [];
    // Back after a disconnection, anything may have changed; on the first load, a list asked for a moment ago is current.
    if (this.loaded) this.sessionList = null;
    try {
      const threads = Object.keys(this.chats);
      const [state, topics, roadmaps, missions, glosses, asides, notes, about, chats] = await Promise.all([
        getJson<FeedState>('/api/state'),
        getJson<Topic[]>('/api/map'),
        getJson<Roadmap[]>('/api/roadmaps'),
        getJson<Mission[]>('/api/missions'),
        getJson<Gloss[]>('/api/glosses'),
        getJson<Aside[]>('/api/asides'),
        getJson<StepNote[]>('/api/notes'),
        getJson<{ text: string }>('/api/about'),
        // Chats already open are read again, so nothing said while disconnected is missed.
        Promise.all(threads.map((t) => getJson<ChatMessage[]>(`/api/chats/${encodeURIComponent(t)}`))),
      ]);
      this.session = state.session;
      this.items = state.items;
      this.warnings = state.warnings ?? [];
      this.topics = Object.fromEntries(topics.map((t) => [t.slug, t]));
      this.roadmaps = Object.fromEntries(roadmaps.map((r) => [r.slug, r]));
      this.missions = Object.fromEntries(missions.map((m) => [m.id, m]));
      this.glosses = glosses;
      this.asides = asides;
      this.notes = notes;
      this.about = about.text;
      for (const [i, t] of threads.entries()) this.chats[t] = chats[i];
      this.connected = true;
      this.loaded = true;
      this.topicVersion++;
    } catch {
      // The server went away mid-load; the next connection loads again.
    } finally {
      this.reloading = false;
      const held = this.held;
      this.held = [];
      for (const event of held) this.apply(event);
      clearTimeout(this.settleTimer);
      this.settled++;
      if (this.again) void this.reload();
    }
  }

  /** A topic, the session or an item changed: summaries are stale, and pages refetch once the feed settles. */
  private changed() {
    this.sessionList = null;
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => this.settled++, SETTLE_MS);
  }

  private apply(event: FeedEvent) {
    switch (event.type) {
      case 'session': {
        const changed = event.session.id !== this.session?.id;
        this.session = event.session;
        if (changed) {
          this.items = [];
          this.starting = null;
          if (event.session.topicSlug && !this.topics[event.session.topicSlug]) void this.loadTopic(event.session.topicSlug);
        }
        this.changed();
        break;
      }
      case 'topic':
        this.topics[event.topic.slug] = event.topic;
        this.topicVersion++;
        this.changed();
        break;
      case 'item':
        this.upsert(event.item);
        break;
      case 'roadmap':
        this.roadmaps = { ...this.roadmaps, [event.roadmap.slug]: event.roadmap };
        break;
      case 'mission':
        this.missions = { ...this.missions, [event.mission.id]: event.mission };
        break;
      case 'warnings':
        this.warnings = event.warnings;
        break;
      case 'gloss':
        put(this.glosses, event.gloss, (g) => g.id === event.gloss.id);
        break;
      case 'gloss-removed':
        this.glosses = this.glosses.filter((g) => g.id !== event.id);
        break;
      case 'aside':
        put(this.asides, event.aside, (a) => a.id === event.aside.id);
        break;
      case 'aside-removed':
        this.asides = this.asides.filter((a) => a.id !== event.id);
        break;
      case 'note':
        put(this.notes, event.note, (n) => n.topic === event.note.topic && n.step === event.note.step);
        break;
      case 'note-removed':
        this.notes = this.notes.filter((n) => !(n.topic === event.topic && n.step === event.step));
        break;
      case 'about':
        this.about = event.about;
        break;
      case 'chat': {
        const list = this.chats[event.thread];
        if (list && !list.some((m) => m.id === event.message.id)) list.push(event.message);
        if (event.message.role === 'assistant') delete this.chatDrafts[event.thread];
        break;
      }
      case 'chat-cleared':
        this.chats[event.thread] = [];
        delete this.chatDrafts[event.thread];
        break;
      case 'chat-delta': {
        // Each delta is appended to the answer it belongs to; a new id starts a new one.
        const draft = this.chatDrafts[event.thread];
        const before = draft?.id === event.id ? draft.text : '';
        this.chatDrafts[event.thread] = { id: event.id, text: before + event.delta };
        break;
      }
    }
  }
}

export const feed = new LiveFeed();

/**
 * For a page showing something the server works out from the record (sessions, progress, the review queue): loads
 * it now, and again each time the feed settles after a change. An older answer arriving late never replaces a newer one.
 * Call it while the component is being set up.
 */
export function refetching<T>(load: () => Promise<T>, apply: (value: T) => void) {
  let asked = 0;
  $effect(() => {
    void feed.settled;
    const mine = ++asked;
    untrack(load).then(
      (value) => {
        if (mine === asked) apply(value);
      },
      () => {
        // Offline for a moment: the next change asks again.
      },
    );
  });
}

/** Summaries of every session on a topic, newest first. */
export async function topicSessions(slug: string): Promise<SessionSummary[]> {
  // The server filters by topic; filtering here too keeps this right against a server that doesn't yet.
  const all = await getJson<SessionSummary[]>(`/api/sessions?topic=${encodeURIComponent(slug)}`);
  return all.filter((s) => s.topicSlug === slug);
}

/** Replaces the record that `same` finds in a live list, or adds it at the end. */
function put<T>(list: T[], record: T, same: (x: T) => boolean) {
  const i = list.findIndex(same);
  if (i === -1) list.push(record);
  else list[i] = record;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.json()) as T;
}
