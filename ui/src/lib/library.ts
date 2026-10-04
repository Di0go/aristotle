// The hierarchy everything hangs on: roadmaps hold steps, a step is a topic, a topic holds concepts.
// Topics that belong to no roadmap are "loose".

import { isFading, stepState, type Concept, type ConceptStatus, type Roadmap, type StepState, type Topic } from '../../../shared/types.ts';

export interface Place {
  roadmap: Roadmap;
  index: number;
}

/** The roadmap a topic is a step of, if any (the first one, when several share it). */
export function placeOf(slug: string, roadmaps: Roadmap[]): Place | null {
  for (const roadmap of roadmaps) {
    const index = roadmap.steps.findIndex((s) => s.topic === slug);
    if (index !== -1) return { roadmap, index };
  }
  return null;
}

export function looseTopics(topics: Record<string, Topic>, roadmaps: Roadmap[]): Topic[] {
  const onRoadmap = new Set(roadmaps.flatMap((r) => r.steps.map((s) => s.topic)));
  return Object.values(topics)
    .filter((t) => !onRoadmap.has(t.slug))
    .sort((a, b) => b.updated.localeCompare(a.updated));
}

export type Counts = Record<ConceptStatus, number> & { fading: number; total: number };

export function countsOf(topic: Topic | undefined): Counts {
  const c: Counts = { unknown: 0, shaky: 0, solid: 0, fading: 0, total: 0 };
  for (const x of topic?.concepts ?? []) {
    c[x.status]++;
    c.total++;
    if (isFading(x)) c.fading++;
  }
  return c;
}

/** The mark a concept gets: solid, fading, shaky or unknown. */
export function markOf(concept: Concept): ConceptStatus | 'fading' {
  return isFading(concept) ? 'fading' : concept.status;
}

/**
 * Concepts in teaching order: every concept after its prerequisites, ties broken by when they joined the
 * map. That is the order a lesson works through them, so it reads as the topic's outline.
 */
export function outline(topic: Topic): Concept[] {
  const byId = new Map(topic.concepts.map((c) => [c.id, c]));
  const order = [...topic.concepts].sort((a, b) => a.firstSeen.localeCompare(b.firstSeen) || topic.concepts.indexOf(a) - topic.concepts.indexOf(b));
  const out: Concept[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (c: Concept) => {
    if (state.get(c.id)) return;
    state.set(c.id, 'visiting');
    for (const dep of c.deps) {
      const d = byId.get(dep);
      if (d && state.get(d.id) !== 'visiting') visit(d);
    }
    state.set(c.id, 'done');
    out.push(c);
  };
  for (const c of order) visit(c);
  return out;
}

export interface StepView {
  index: number;
  title: string;
  goal: string;
  why?: string;
  slug: string;
  topic?: Topic;
  state: StepState;
  counts: Counts;
}

export function stepsOf(roadmap: Roadmap, topics: Record<string, Topic>): StepView[] {
  return roadmap.steps.map((s, index) => {
    const topic = topics[s.topic];
    return { index, title: s.title, goal: s.goal, why: s.why, slug: s.topic, topic, state: stepState(topic), counts: countsOf(topic) };
  });
}
