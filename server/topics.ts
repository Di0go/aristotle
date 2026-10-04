// Knowledge maps: one JSON file per topic in data/topics/. The session logs record every change too,
// so a map can always be explained from its history.

import { EventEmitter } from 'node:events';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TOPICS_DIR } from './config.ts';
import { gradeReview, retrievability, startReview, type Outcome } from './reviews.ts';
import { slugify } from './slug.ts';
import {
  isFading,
  type Concept,
  type ConceptStatus,
  type FadingConcept,
  type Evidence,
  type Handoff,
  type MapChange,
  type Topic,
  type TopicSummary,
} from '../shared/types.ts';

export interface ConceptInput {
  id: string;
  label?: string;
  summary?: string;
  status?: ConceptStatus;
  deps?: string[];
  goal?: boolean;
  note?: string;
}

export class Topics {
  private topics = new Map<string, Topic>();
  private saving = new Map<string, Promise<void>>();
  readonly events = new EventEmitter<{ topic: [Topic] }>();

  static async load(): Promise<Topics> {
    const store = new Topics();
    await mkdir(TOPICS_DIR, { recursive: true });
    for (const file of await readdir(TOPICS_DIR)) {
      if (!file.endsWith('.json')) continue;
      const topic = JSON.parse(await readFile(path.join(TOPICS_DIR, file), 'utf8')) as Topic;
      store.topics.set(topic.slug, topic);
    }
    return store;
  }

  get(slugOrTitle: string): Topic | undefined {
    return this.topics.get(slugOrTitle) ?? this.topics.get(slugify(slugOrTitle));
  }

  list(): TopicSummary[] {
    return [...this.topics.values()]
      .map(summarize)
      .sort((a, b) => b.updated.localeCompare(a.updated));
  }

  /** Finds a topic by slug or title, or creates it. */
  async ensure(titleOrSlug: string, goal: string): Promise<{ topic: Topic; created: boolean }> {
    const existing = this.get(titleOrSlug);
    if (existing) return { topic: existing, created: false };
    const now = new Date().toISOString();
    const topic: Topic = {
      slug: slugify(titleOrSlug),
      title: titleOrSlug,
      goal,
      created: now,
      updated: now,
      concepts: [],
      sessions: [],
    };
    this.topics.set(topic.slug, topic);
    await this.save(topic);
    return { topic, created: true };
  }

  async addSession(slug: string, session: string) {
    const topic = this.require(slug);
    topic.sessions.push(session);
    await this.save(topic);
  }

  /** Adds or updates concepts and removes others. Returns what changed in ways worth showing. */
  async update(slug: string, inputs: ConceptInput[], remove: string[] = [], focus?: string): Promise<MapChange[]> {
    const topic = this.require(slug);
    const now = new Date().toISOString();
    const changes: MapChange[] = [];

    for (const input of inputs) {
      const id = slugify(input.id);
      const deps = input.deps?.map(normalizeDep).filter((d) => d !== id);
      let concept = topic.concepts.find((c) => c.id === id);
      if (!concept) {
        concept = {
          id,
          label: input.label ?? input.id,
          status: input.status ?? 'unknown',
          deps: deps ?? [],
          firstSeen: now,
          updated: now,
          evidence: [],
        };
        if (input.summary) concept.summary = input.summary;
        if (input.goal) concept.goal = true;
        if (input.note) concept.note = input.note;
        if (concept.status === 'solid') {
          concept.solidSince = now;
          concept.review = startReview(new Date(now));
        }
        topic.concepts.push(concept);
        changes.push({ id, label: concept.label, added: true, to: concept.status });
        continue;
      }
      if (input.label !== undefined) concept.label = input.label;
      if (input.summary !== undefined) concept.summary = input.summary || undefined;
      if (input.note !== undefined) concept.note = input.note || undefined;
      if (input.goal !== undefined) concept.goal = input.goal || undefined;
      if (deps !== undefined) concept.deps = deps;
      if (input.status !== undefined && input.status !== concept.status) {
        changes.push({ id, label: concept.label, from: concept.status, to: input.status });
        setStatus(concept, input.status, now);
      }
      concept.updated = now;
    }

    for (const raw of remove) {
      const id = slugify(raw);
      const concept = topic.concepts.find((c) => c.id === id);
      if (!concept) continue;
      topic.concepts = topic.concepts.filter((c) => c.id !== id);
      for (const c of topic.concepts) c.deps = c.deps.filter((d) => d !== id);
      changes.push({ id, label: concept.label, removed: true });
    }

    if (focus !== undefined) topic.focus = focus ? slugify(focus) : undefined;
    topic.updated = now;
    await this.save(topic);
    return changes;
  }

  /**
   * Records a review or training attempt. Updates the review card of a concept that has one; a wrong
   * answer on a solid concept makes it shaky. Returns the status change, if any, and the new due date.
   */
  async recordPractice(
    slug: string,
    conceptId: string,
    outcome: Outcome,
    evidence: Omit<Evidence, 'kind' | 'result'>,
  ): Promise<{ concept: Concept; change?: MapChange; recallBefore?: number } | null> {
    const topic = this.require(slug);
    const concept = topic.concepts.find((c) => c.id === slugify(conceptId));
    if (!concept) return null;
    const now = new Date(evidence.at);
    concept.evidence.push({ ...evidence, kind: 'practice', result: outcome });
    let recallBefore: number | undefined;
    let change: MapChange | undefined;
    if (concept.review) {
      recallBefore = retrievability(concept.review, now);
      concept.review = gradeReview(concept.review, outcome, now);
    }
    if (outcome === 'wrong' && concept.status === 'solid') {
      change = { id: concept.id, label: concept.label, from: 'solid', to: 'shaky' };
      concept.status = 'shaky';
    }
    concept.updated = evidence.at;
    topic.updated = evidence.at;
    await this.save(topic);
    return { concept, ...(change ? { change } : {}), ...(recallBefore !== undefined ? { recallBefore } : {}) };
  }

  /** Moves the training level by `delta` (clamped to 1-10) and returns it. */
  async adjustTraining(slug: string, delta: number): Promise<{ from: number; to: number }> {
    const topic = this.require(slug);
    const from = topic.training?.level ?? 1;
    const to = Math.min(10, Math.max(1, from + delta));
    topic.training = { level: to, updated: new Date().toISOString() };
    await this.save(topic);
    return { from, to };
  }

  /** Solid concepts past their review date, least likely to be recalled first. */
  fading(topicSlug?: string, now = new Date()): FadingConcept[] {
    const out: FadingConcept[] = [];
    for (const topic of this.topics.values()) {
      if (topicSlug && topic.slug !== topicSlug) continue;
      for (const c of topic.concepts) {
        if (!isFading(c, now.getTime())) continue;
        const last = c.evidence.at(-1)?.at;
        out.push({
          topic: topic.slug,
          topicTitle: topic.title,
          id: c.id,
          label: c.label,
          ...(c.summary ? { summary: c.summary } : {}),
          due: c.review!.due,
          recall: retrievability(c.review!, now),
          ...(last ? { lastPractised: last } : {}),
        });
      }
    }
    return out.sort((a, b) => a.recall - b.recall);
  }

  /** Solid concepts coming due within `days`. */
  upcoming(days: number, now = new Date()): number {
    const limit = now.getTime() + days * 86_400_000;
    let n = 0;
    for (const topic of this.topics.values()) {
      for (const c of topic.concepts) {
        if (c.status !== 'solid' || !c.review) continue;
        const due = Date.parse(c.review.due);
        if (due > now.getTime() && due <= limit) n++;
      }
    }
    return n;
  }

  all(): Topic[] {
    return [...this.topics.values()];
  }

  async setFocus(slug: string, concept: string) {
    const topic = this.require(slug);
    const id = slugify(concept);
    if (topic.focus === id || !topic.concepts.some((c) => c.id === id)) return;
    topic.focus = id;
    await this.save(topic);
  }

  /** Records evidence on a concept. Returns false if the concept isn't on the map. */
  async recordEvidence(slug: string, concept: string, evidence: Evidence): Promise<boolean> {
    const topic = this.require(slug);
    const c = topic.concepts.find((x) => x.id === slugify(concept));
    if (!c) return false;
    c.evidence.push(evidence);
    topic.updated = evidence.at;
    await this.save(topic);
    return true;
  }

  async setHandoff(slug: string, handoff: Handoff) {
    const topic = this.require(slug);
    topic.handoff = handoff;
    topic.focus = undefined;
    topic.updated = handoff.at;
    await this.save(topic);
  }

  private require(slug: string): Topic {
    const topic = this.topics.get(slug);
    if (!topic) throw new Error(`No topic "${slug}"`);
    return topic;
  }

  /** Atomic write (temp file + rename), one write at a time per topic. */
  private async save(topic: Topic) {
    const file = path.join(TOPICS_DIR, `${topic.slug}.json`);
    const previous = this.saving.get(topic.slug) ?? Promise.resolve();
    const next = previous.then(async () => {
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(topic, null, 2) + '\n');
      await rename(tmp, file);
    });
    this.saving.set(topic.slug, next);
    await next;
    this.events.emit('topic', topic);
  }
}

/** Changes a concept's status, keeping its review card in step: becoming solid counts as a successful
 * review (or starts the card), and falling from solid counts as a lapse. */
function setStatus(concept: Concept, status: ConceptStatus, nowIso: string) {
  const now = new Date(nowIso);
  if (status === 'solid') {
    concept.solidSince = nowIso;
    concept.review = concept.review ? gradeReview(concept.review, 'right', now) : startReview(now);
  } else if (concept.status === 'solid' && concept.review) {
    concept.review = gradeReview(concept.review, 'wrong', now);
  }
  concept.status = status;
}

export function summarize(topic: Topic): TopicSummary {
  const counts: Record<ConceptStatus, number> = { unknown: 0, shaky: 0, solid: 0 };
  let fading = 0;
  for (const c of topic.concepts) {
    counts[c.status]++;
    if (isFading(c)) fading++;
  }
  return {
    slug: topic.slug,
    title: topic.title,
    goal: topic.goal,
    updated: topic.updated,
    counts,
    fading,
    sessions: topic.sessions.length,
    ...(topic.handoff ? { handoff: topic.handoff } : {}),
    ...(topic.training ? { trainingLevel: topic.training.level } : {}),
  };
}

/** "Other Topic/Some Concept" -> "other-topic/some-concept"; plain ids are slugified. */
function normalizeDep(dep: string): string {
  const [a, b] = dep.split('/');
  return b === undefined ? slugify(a) : `${slugify(a)}/${slugify(b)}`;
}

/** The map as Claude reads it: statuses, structure and a short evidence record per concept. */
export function describeTopic(topic: Topic): string {
  const lines = topic.concepts.map((c) => {
    const ev = c.evidence;
    const right = ev.filter((e) => e.result === 'right').length;
    const wrong = ev.filter((e) => e.result === 'wrong').length;
    const dk = ev.filter((e) => e.result === 'dont-know').length;
    const asks = ev.filter((e) => e.kind === 'ask').length;
    const practice = ev.filter((e) => e.kind === 'practice');
    const record =
      (ev.length ? ` | checks: ${right} right, ${wrong} wrong, ${dk} don't know, ${asks} written` : '') +
      (practice.length ? ` | practice: ${practice.map((e) => e.result).join(' ')}` : '');
    const fading = isFading(c);
    const review = c.review && c.status === 'solid' ? ` | review ${fading ? 'OVERDUE since' : 'due'} ${c.review.due.slice(0, 10)}` : '';
    const flags = [c.goal ? 'GOAL' : '', topic.focus === c.id ? 'FOCUS' : '', fading ? 'FADING' : ''].filter(Boolean).join(', ');
    return (
      `- ${c.id} "${c.label}" [${c.status}]${flags ? ` (${flags})` : ''}` +
      (c.deps.length ? ` <- ${c.deps.join(', ')}` : '') +
      (c.summary ? `\n    ${c.summary}` : '') +
      (c.note ? `\n    note: ${c.note}` : '') +
      record +
      review
    );
  });
  const h = topic.handoff;
  return [
    `# ${topic.title} (${topic.slug})`,
    `Goal: ${topic.goal}`,
    `Sessions: ${topic.sessions.length}`,
    topic.training ? `Training level: ${topic.training.level}/10` : '',
    h ? `\nLast handoff (${h.at.slice(0, 10)}):\n  Locked in: ${h.locked}\n  Still shaky: ${h.shaky}\n  Next: ${h.next}` : '',
    `\nConcepts (${topic.concepts.length}), "a <- b" means a depends on b:`,
    lines.length ? lines.join('\n') : '(none yet)',
  ]
    .filter((l) => l !== '')
    .join('\n');
}
