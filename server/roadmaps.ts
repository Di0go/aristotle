// Roadmaps: one JSON file per roadmap in data/roadmaps/. Each step names the topic it becomes, so its
// progress is read off that topic's map rather than stored twice.

import { EventEmitter } from 'node:events';
import path from 'node:path';
import { ROADMAPS_DIR } from './config.ts';
import { slugCandidates, slugify } from './slug.ts';
import { isObject, loadJsonDir, WriteQueue, writeJson } from './store.ts';
import { stepState, type Roadmap, type RoadmapStep, type Topic } from '../shared/types.ts';

export interface RoadmapInput {
  title: string;
  goal: string;
  status: Roadmap['status'];
  use?: string;
  steps: { title: string; goal: string; why?: string; topic?: string }[];
}

const STATE_LABEL = { 'not-started': 'not started', started: 'started', done: 'done' } as const;

export class Roadmaps {
  private roadmaps = new Map<string, Roadmap>();
  private queue = new WriteQueue();
  readonly events = new EventEmitter<{ roadmap: [Roadmap] }>();

  static async load(): Promise<Roadmaps> {
    const store = new Roadmaps();
    for (const roadmap of await loadJsonDir(ROADMAPS_DIR, isRoadmap)) store.roadmaps.set(roadmap.slug, roadmap);
    return store;
  }

  /** By slug, or by a title that slugifies to one (as it does now, or did before Unicode slugs). */
  get(slugOrTitle: string): Roadmap | undefined {
    return (
      this.roadmaps.get(slugOrTitle) ??
      slugCandidates(slugOrTitle)
        .map((s) => this.roadmaps.get(s))
        .find(Boolean)
    );
  }

  /** Most recently changed first. */
  all(): Roadmap[] {
    return [...this.roadmaps.values()].sort((a, b) => b.updated.localeCompare(a.updated));
  }

  /** The roadmaps a topic is a step of, with its position in each. */
  containing(topicSlug: string): { roadmap: Roadmap; index: number }[] {
    return this.all().flatMap((roadmap) => {
      const index = roadmap.steps.findIndex((s) => s.topic === topicSlug);
      return index === -1 ? [] : [{ roadmap, index }];
    });
  }

  /** Creates the roadmap, or replaces the steps of the one with this title or slug. */
  async save(input: RoadmapInput, slug?: string): Promise<{ roadmap: Roadmap; created: boolean }> {
    const now = new Date().toISOString();
    const existing = this.get(slug ?? input.title);
    const steps: RoadmapStep[] = input.steps.map((s) => ({
      topic: slugify(s.topic ?? s.title),
      title: s.title,
      goal: s.goal,
      ...(s.why ? { why: s.why } : {}),
    }));
    const roadmap: Roadmap = {
      slug: existing?.slug ?? slugify(slug ?? input.title),
      title: input.title,
      goal: input.goal,
      status: input.status,
      ...((input.use ?? existing?.use) ? { use: input.use ?? existing?.use } : {}),
      created: existing?.created ?? now,
      updated: now,
      steps,
    };
    this.roadmaps.set(roadmap.slug, roadmap);
    await this.write(roadmap);
    return { roadmap, created: !existing };
  }

  /** Resolves once every write queued so far has finished. */
  idle(): Promise<void> {
    return this.queue.idle();
  }

  /** Atomic write, one write at a time per roadmap (store.ts). */
  private async write(roadmap: Roadmap) {
    await this.queue.run(roadmap.slug, () => writeJson(path.join(ROADMAPS_DIR, `${roadmap.slug}.json`), roadmap));
    this.events.emit('roadmap', roadmap);
  }
}

/** The shape a roadmap file must have to be loaded. */
function isRoadmap(v: unknown): v is Roadmap {
  return isObject(v) && typeof v.slug === 'string' && typeof v.title === 'string' && Array.isArray(v.steps);
}

/** The roadmap as Claude reads it: each step with the state of its topic. */
export function describeRoadmap(roadmap: Roadmap, topics: (slug: string) => Topic | undefined): string {
  const lines = roadmap.steps.map((s, i) => {
    const topic = topics(s.topic);
    const state = stepState(topic);
    const solid = topic ? `, ${topic.concepts.filter((c) => c.status === 'solid').length}/${topic.concepts.length} concepts solid` : '';
    return `${i + 1}. ${s.title} (topic ${s.topic}) [${STATE_LABEL[state]}${solid}]\n    Goal: ${s.goal}${s.why ? `\n    Why here: ${s.why}` : ''}`;
  });
  return [
    `# ${roadmap.title} (${roadmap.slug})${roadmap.status === 'draft' ? ' [DRAFT: not approved yet]' : ''}`,
    `Goal: ${roadmap.goal}`,
    roadmap.use ? `Where they will use it: ${roadmap.use}` : 'Where they will use it: (not asked yet: ask them, and save it with `use`)',
    `\nSteps, in order:`,
    lines.join('\n') || '(none)',
  ].join('\n');
}
