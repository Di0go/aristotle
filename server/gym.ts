// Ties the live feed to the knowledge maps: answers become evidence on concepts, map changes show up
// in the feed, practice moves review schedules and training levels, and data/ is backed up.

import path from 'node:path';
import { Backup } from './backup.ts';
import { SESSIONS_DIR } from './config.ts';
import { Asides } from './asides.ts';
import { Glosses } from './glosses.ts';
import { Feed, readSession, SessionCache, summarizeSession, type SessionRecord } from './feed.ts';
import { Missions } from './missions.ts';
import { Notes } from './notes.ts';
import { Chats } from './chat.ts';
import type { Outcome } from './reviews.ts';
import { Roadmaps } from './roadmaps.ts';
import { slugify } from './slug.ts';
import { Topics, type ConceptInput } from './topics.ts';
import type {
  AskItem,
  Concept,
  Handoff,
  MapChange,
  Mission,
  MissionVerdict,
  Progress,
  QuizItem,
  ReviewQueue,
  SessionKind,
  SessionSummary,
  Topic,
} from '../shared/types.ts';

export interface PracticeResult {
  concept: string;
  outcome: Outcome;
  kind: 'recall' | 'problem';
}

/** A concept's status change in a session log, keyed "topic/concept". */
interface StatusChange {
  at: string;
  key: string;
  to?: string;
  removed?: boolean;
}

/** The stores, wired together: every store's changes reach the feed's live events, and any event schedules a backup. */
export class Gym {
  readonly feed: Feed;
  readonly topics: Topics;
  readonly roadmaps: Roadmaps;
  readonly missions: Missions;
  readonly glosses: Glosses;
  readonly asides: Asides;
  readonly notes: Notes;
  readonly chats: Chats;
  readonly backup = new Backup();
  private summaries = new SessionCache((record) => summarizeSession(record));
  private statusChanges = new SessionCache((record) => statusChanges(record));

  constructor(
    feed: Feed,
    topics: Topics,
    roadmaps: Roadmaps,
    missions: Missions,
    glosses: Glosses,
    asides: Asides,
    notes: Notes,
    chats: Chats,
  ) {
    this.feed = feed;
    this.topics = topics;
    this.roadmaps = roadmaps;
    this.missions = missions;
    this.glosses = glosses;
    this.asides = asides;
    this.notes = notes;
    this.chats = chats;
    topics.events.on('topic', (topic) => feed.events.emit('event', { type: 'topic', topic }));
    roadmaps.events.on('roadmap', (roadmap) => feed.events.emit('event', { type: 'roadmap', roadmap }));
    missions.events.on('mission', (mission) => feed.events.emit('event', { type: 'mission', mission }));
    glosses.events.on('glosses', (list) => feed.events.emit('event', { type: 'glosses', glosses: list }));
    asides.events.on('asides', (list) => feed.events.emit('event', { type: 'asides', asides: list }));
    notes.events.on('notes', (list) => feed.events.emit('event', { type: 'notes', notes: list }));
    notes.events.on('about', (about) => feed.events.emit('event', { type: 'about', about }));
    chats.events.on('message', (thread, message) => feed.events.emit('event', { type: 'chat', thread, message }));
    chats.events.on('delta', (d) => feed.events.emit('event', { type: 'chat-delta', ...d }));
    chats.events.on('cleared', (thread) => feed.events.emit('event', { type: 'chat-cleared', thread }));
    feed.events.on('event', () => this.backup.schedule());
    this.backup.schedule(30_000);
  }

  static async load(): Promise<Gym> {
    return new Gym(
      await Feed.load(),
      await Topics.load(),
      await Roadmaps.load(),
      await Missions.load(),
      await Glosses.load(),
      await Asides.load(),
      await Notes.load(),
      await Chats.load(),
    );
  }

  /** The current session's topic, if it has one on the map. */
  currentTopic(): Topic | undefined {
    const slug = this.feed.session?.topicSlug;
    return slug ? this.topics.get(slug) : undefined;
  }

  /** "topic/concept", or a bare concept id in the current session's topic. */
  resolve(ref: string): { topic: Topic; concept: Concept } | null {
    const [a, b] = ref.split('/');
    const topic = b === undefined ? this.currentTopic() : this.topics.get(a);
    const id = slugify(b ?? a);
    const concept = topic?.concepts.find((c) => c.id === id);
    return topic && concept ? { topic, concept } : null;
  }

  /** Starts a session: on a topic (found or created), or a review across all of them. */
  async startSession(topicName: string, goal: string, topicGoal?: string, kind: SessionKind = 'learn') {
    if (kind === 'review') {
      const session = await this.feed.startSession('Review', '', goal, kind);
      return { session, topic: undefined, created: false };
    }
    const { topic, created } = await this.topics.ensure(topicName, topicGoal ?? goal);
    const session = await this.feed.startSession(topic.title, topic.slug, goal, kind);
    await this.topics.addSession(topic.slug, session.id);
    return { session, topic, created };
  }

  /** Shows the handoff, closes the session, and keeps the handoff on its topic for next time. */
  async endSession(locked: string, shaky: string, next: string): Promise<Handoff> {
    const session = this.feed.session;
    if (!session) throw new Error('No session to end.');
    const handoff: Handoff = { at: new Date().toISOString(), session: session.id, locked, shaky, next };
    await this.feed.add({
      type: 'block',
      kind: 'summary',
      title: 'Done for now',
      markdown: `**Locked in:** ${locked}\n\n**Still shaky:** ${shaky}\n\n**Next time:** ${next}`,
    });
    await this.feed.endSession(handoff);
    if (session.topicSlug && this.topics.get(session.topicSlug)) await this.topics.setHandoff(session.topicSlug, handoff);
    this.backup.schedule(5_000);
    return handoff;
  }

  /** Changes a map (the session's topic by default); status changes also show in the feed. */
  async updateMap(inputs: ConceptInput[], remove: string[], focus?: string, topicSlug?: string): Promise<MapChange[]> {
    const topic = topicSlug ? this.topics.get(topicSlug) : this.currentTopic();
    if (!topic) {
      throw new Error(topicSlug ? `No topic "${topicSlug}"` : 'This session has no topic: pass `topic` (a topic slug).');
    }
    const changes = await this.topics.update(topic.slug, inputs, remove, focus);
    if (changes.length && this.feed.session) await this.feed.add({ type: 'map', topic: topic.slug, changes });
    return changes;
  }

  /** Highlights the concept being taught, when it belongs to the session's topic. */
  async focus(ref: string) {
    const found = this.resolve(ref);
    if (found && found.topic.slug === this.feed.session?.topicSlug) await this.topics.setFocus(found.topic.slug, found.concept.id);
  }

  /** Saves his quiz answers; each question tagged with a concept becomes evidence on it. */
  async answerQuiz(id: string, picks: { choice: number | null; note?: string }[]): Promise<QuizItem> {
    const item = await this.feed.answerQuiz(id, picks);
    const session = this.feed.session;
    if (!session) return item;
    for (const [i, q] of item.questions.entries()) {
      const r = item.responses?.[i];
      const found = q.concept ? this.resolve(q.concept) : null;
      if (!found || !r) continue;
      await this.topics.recordEvidence(found.topic.slug, found.concept.id, {
        at: item.answeredAt!,
        session: session.id,
        item: item.id,
        kind: 'quiz',
        result: r.choice === null ? 'dont-know' : r.correct ? 'right' : 'wrong',
      });
    }
    return item;
  }

  /** Saves his written answer, as evidence on its concept if it has one. */
  async answerAsk(id: string, text: string): Promise<AskItem> {
    const item = await this.feed.answerAsk(id, text);
    const session = this.feed.session;
    const found = item.concept ? this.resolve(item.concept) : null;
    if (session && found) {
      await this.topics.recordEvidence(found.topic.slug, found.concept.id, {
        at: item.answeredAt!,
        session: session.id,
        item: item.id,
        kind: 'ask',
      });
    }
    return item;
  }

  /**
   * Records review and training results. Moves review schedules, makes failed solid concepts shaky,
   * and, for problems with a difficulty, moves the topic's training level.
   */
  async recordPractice(results: PracticeResult[], difficulty?: number) {
    const session = this.feed.session;
    if (!session) throw new Error('No session: call start_session first.');
    const at = new Date().toISOString();
    const lines: string[] = [];
    const changes = new Map<string, MapChange[]>();
    const problems = new Map<string, Outcome[]>();

    for (const r of results) {
      const found = this.resolve(r.concept);
      if (!found) {
        lines.push(`${r.concept}: no such concept (use "topic/concept" outside the session's topic).`);
        continue;
      }
      const { topic, concept } = found;
      const res = await this.topics.recordPractice(topic.slug, concept.id, r.outcome, {
        at,
        session: session.id,
        practice: r.kind,
        ...(r.kind === 'problem' && difficulty ? { difficulty } : {}),
      });
      if (!res) continue;
      if (res.change) append(changes, topic.slug, res.change);
      if (r.kind === 'problem' && difficulty) append(problems, topic.slug, r.outcome);
      const before = res.recallBefore === undefined ? '' : `, recall was ~${Math.round(res.recallBefore * 100)}%`;
      const next =
        res.concept.review && res.concept.status === 'solid'
          ? `next review ${res.concept.review.due.slice(0, 10)}`
          : 'not scheduled (not solid)';
      lines.push(`${topic.slug}/${concept.id}: ${r.outcome}${before}; ${res.change ? 'now shaky; ' : ''}${next}`);
    }

    for (const [slug, list] of changes) await this.feed.add({ type: 'map', topic: slug, changes: list });

    for (const [slug, outcomes] of problems) {
      const level = this.topics.get(slug)?.training?.level ?? 1;
      // Progressive overload: up after clean solves at or above the current level, down after a miss.
      const delta = outcomes.includes('wrong') ? -1 : outcomes.every((o) => o === 'right') && difficulty! >= level ? 1 : 0;
      const { from, to } = await this.topics.adjustTraining(slug, delta);
      lines.push(`Training level for ${slug}: ${from === to ? `stays at ${to}` : `${from} → ${to}`}/10.`);
    }
    return lines;
  }

  /**
   * Closes a mission with Claude's review. Each concept result counts as practice (kind "mission"), so it
   * moves review schedules like any other; outside a session the evidence points at the mission instead.
   */
  async reviewMission(id: string, verdict: MissionVerdict, markdown: string, results: { concept: string; outcome: Outcome }[]) {
    const mission = this.missions.get(id);
    if (!mission) throw new Error(`No mission "${id}".`);
    const at = new Date().toISOString();
    const session = this.feed.session && !this.feed.session.endedAt ? this.feed.session.id : `mission:${mission.id}`;
    const lines: string[] = [];
    const changes = new Map<string, MapChange[]>();
    for (const r of results) {
      const found = this.resolveIn(r.concept, mission);
      if (!found) {
        lines.push(`${r.concept}: no such concept (use "topic/concept").`);
        continue;
      }
      const res = await this.topics.recordPractice(found.topic.slug, found.concept.id, r.outcome, { at, session, practice: 'mission' });
      if (!res) continue;
      if (res.change) append(changes, found.topic.slug, res.change);
      lines.push(`${found.topic.slug}/${found.concept.id}: ${r.outcome}${res.change ? ', now shaky' : ''}`);
    }
    // Checked again: the session may have ended while the results were being recorded.
    if (this.feed.session && !this.feed.session.endedAt) {
      for (const [slug, list] of changes) await this.feed.add({ type: 'map', topic: slug, changes: list });
    }
    const reviewed: Mission = await this.missions.review(mission.id, verdict, markdown);
    return { mission: reviewed, lines };
  }

  /** What's fading, and what has been practised in the current session. */
  reviewQueue(): ReviewQueue {
    const sessionId = this.feed.session?.id;
    const practised: ReviewQueue['practised'] = [];
    if (sessionId) {
      for (const topic of this.topics.all()) {
        for (const c of topic.concepts) {
          const last = c.evidence.findLast((e) => e.kind === 'practice' && e.session === sessionId);
          if (last?.result) practised.push({ topic: topic.slug, id: c.id, label: c.label, result: last.result, at: last.at });
        }
      }
    }
    practised.sort((a, b) => a.at.localeCompare(b.at));
    return { fading: this.topics.fading(), practised, upcoming: this.topics.upcoming(7) };
  }

  /** Every session (or a topic's), newest first. */
  async listSessions(topicSlug?: string): Promise<SessionSummary[]> {
    const summaries = await this.summaries.values();
    return summaries.filter((s): s is SessionSummary => s !== null && (!topicSlug || s.topicSlug === topicSlug)).reverse();
  }

  /** A whole session by id; null for an unknown or malformed id. */
  async readSession(id: string) {
    if (!/^[\w-]+$/.test(id)) return null;
    try {
      return await readSession(path.join(SESSIONS_DIR, `${id}.jsonl`));
    } catch {
      return null;
    }
  }

  /** The charts on the Progress page. */
  async progress(): Promise<Progress> {
    const solid = await this.solidOverTime();
    const answers = answersPerWeek(this.topics.all());
    const minutes = minutesPerWeek(await this.listSessions());
    return {
      solid,
      answers,
      minutes,
      fading: this.topics.fading(),
      upcoming: this.topics.upcoming(7),
      training: this.topics
        .all()
        .filter((t) => t.training)
        .map((t) => ({ topic: t.slug, title: t.title, level: t.training!.level })),
    };
  }

  /** Solid concepts at the end of each day, replayed from the map changes in every session log. */
  private async solidOverTime(): Promise<Progress['solid']> {
    const status = new Map<string, string>();
    const byDay = new Map<string, number>();
    const changes = (await this.statusChanges.values()).flat();
    changes.sort((a, b) => a.at.localeCompare(b.at));
    for (const c of changes) {
      if (c.removed) status.delete(c.key);
      else if (c.to) status.set(c.key, c.to);
      byDay.set(localDay(c.at), [...status.values()].filter((s) => s === 'solid').length);
    }
    // The maps are the truth for today, including any change made outside a session.
    byDay.set(
      localDay(new Date().toISOString()),
      this.topics.all().reduce((n, t) => n + t.concepts.filter((c) => c.status === 'solid').length, 0),
    );
    return [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count }));
  }

  /** A concept named in a mission review: "topic/id", or a bare id in the mission's topic. */
  private resolveIn(ref: string, mission: Mission) {
    if (ref.includes('/')) return this.resolve(ref);
    const topic = this.topics.get(mission.topic ?? '') ?? this.currentTopic();
    const concept = topic?.concepts.find((c) => c.id === slugify(ref));
    return topic && concept ? { topic, concept } : null;
  }
}

/** The status changes recorded in one session log. */
function statusChanges(record: SessionRecord): StatusChange[] {
  const found: StatusChange[] = [];
  for (const item of record.items) {
    if (item.type !== 'map') continue;
    for (const c of item.changes) found.push({ at: item.at, key: `${item.topic}/${c.id}`, to: c.to, removed: c.removed });
  }
  return found;
}

/** Answers per week, from the evidence on every concept. */
function answersPerWeek(topics: Topic[]): Progress['answers'] {
  const answers = new Map<string, { right: number; partial: number; wrong: number }>();
  for (const topic of topics) {
    for (const c of topic.concepts) {
      for (const e of c.evidence) {
        if (!e.result) continue;
        const week = weekOf(e.at);
        const row = answers.get(week) ?? { right: 0, partial: 0, wrong: 0 };
        if (e.result === 'right') row.right++;
        else if (e.result === 'partial') row.partial++;
        else row.wrong++;
        answers.set(week, row);
      }
    }
  }
  return [...answers].sort(([a], [b]) => a.localeCompare(b)).map(([week, r]) => ({ week, ...r }));
}

/** Active minutes per week, by session kind. */
function minutesPerWeek(sessions: SessionSummary[]): Progress['minutes'] {
  const minutes = new Map<string, { learn: number; review: number; train: number }>();
  for (const s of sessions) {
    const week = weekOf(s.startedAt);
    const row = minutes.get(week) ?? { learn: 0, review: 0, train: 0 };
    row[s.kind] += s.activeMinutes;
    minutes.set(week, row);
  }
  return [...minutes].sort(([a], [b]) => a.localeCompare(b)).map(([week, r]) => ({ week, ...r }));
}

/** Adds `value` to the list kept under `key`. */
function append<T>(map: Map<string, T[]>, key: string, value: T) {
  map.set(key, [...(map.get(key) ?? []), value]);
}

/** YYYY-MM-DD in local time. */
function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The Monday starting the week of `iso`, as YYYY-MM-DD in local time. */
function weekOf(iso: string): string {
  const d = new Date(iso);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDay(d.toISOString());
}
