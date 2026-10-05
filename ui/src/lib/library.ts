// The hierarchy everything hangs on: roadmaps hold steps, a step is a topic, a topic holds concepts.
// Topics that belong to no roadmap are "loose".

import { isFading, stepState, type Concept, type ConceptStatus, type Mission, type Roadmap, type StepState, type Topic } from '../../../shared/types.ts';

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

// Praxis: missions hang off a step (by topic), a whole roadmap (its capstone), or a loose topic.

export const SCOPE_LABEL = { step: 'Step mission', capstone: 'Capstone', topic: 'Topic mission' } as const;
export const STATUS_LABEL = { open: 'To do', debriefed: 'Waiting for review', reviewed: 'Reviewed', dropped: 'Dropped' } as const;
export const VERDICT_LABEL = { achieved: 'Achieved', partly: 'Partly', missed: 'Missed' } as const;

/** Where a mission comes from, in words: "The fighting mind · step 2: Performance under pressure". */
export function missionSource(m: Mission, roadmaps: Record<string, Roadmap>, topics: Record<string, Topic>): string {
  const roadmap = m.roadmap ? roadmaps[m.roadmap] : undefined;
  if (m.scope === 'capstone') return roadmap ? `${roadmap.title} · the whole roadmap` : (m.roadmap ?? '');
  const index = roadmap?.steps.findIndex((s) => s.topic === m.topic) ?? -1;
  const title = (index >= 0 ? roadmap!.steps[index].title : undefined) ?? topics[m.topic ?? '']?.title ?? m.topic ?? '';
  return roadmap && index >= 0 ? `${roadmap.title} · step ${index + 1}: ${title}` : title;
}

export interface MissionSlot {
  roadmap: Roadmap;
  /** The step's index, or null for the roadmap's capstone. */
  index: number | null;
  title: string;
}

/** Finished steps with no mission yet, and finished roadmaps with no capstone: where a mission is due. */
export function missionsDue(roadmaps: Roadmap[], topics: Record<string, Topic>, missions: Mission[]): MissionSlot[] {
  const out: MissionSlot[] = [];
  const live = missions.filter((m) => m.status !== 'dropped');
  for (const r of roadmaps) {
    if (r.status !== 'active') continue;
    const steps = stepsOf(r, topics);
    for (const s of steps) {
      if (s.state === 'done' && !live.some((m) => m.scope === 'step' && m.topic === s.slug)) out.push({ roadmap: r, index: s.index, title: s.title });
    }
    if (steps.length && steps.every((s) => s.state === 'done') && !live.some((m) => m.scope === 'capstone' && m.roadmap === r.slug)) {
      out.push({ roadmap: r, index: null, title: r.title });
    }
  }
  return out;
}
