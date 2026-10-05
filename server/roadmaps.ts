// Roadmaps: one JSON file per roadmap in data/roadmaps/. Each step names the topic it becomes, so its
// progress is read off that topic's map rather than stored twice.

import { EventEmitter } from 'node:events';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROADMAPS_DIR } from './config.ts';
import { slugify } from './slug.ts';
import { stepState, type Roadmap, type RoadmapStep, type Topic } from '../shared/types.ts';

export interface RoadmapInput {
  title: string;
  goal: string;
  status: Roadmap['status'];
  steps: { title: string; goal: string; why?: string; topic?: string }[];
}

const STATE_LABEL = { 'not-started': 'not started', started: 'started', done: 'done' } as const;

export class Roadmaps {
  private roadmaps = new Map<string, Roadmap>();
  private saving = new Map<string, Promise<void>>();
  readonly events = new EventEmitter<{ roadmap: [Roadmap] }>();

  static async load(): Promise<Roadmaps> {
    const store = new Roadmaps();
    await mkdir(ROADMAPS_DIR, { recursive: true });
    for (const file of await readdir(ROADMAPS_DIR)) {
      if (!file.endsWith('.json')) continue;
      const roadmap = JSON.parse(await readFile(path.join(ROADMAPS_DIR, file), 'utf8')) as Roadmap;
      store.roadmaps.set(roadmap.slug, roadmap);
    }
    return store;
  }

  /** By slug, or by a title that slugifies to one. */
  get(slugOrTitle: string): Roadmap | undefined {
    return this.roadmaps.get(slugOrTitle) ?? this.roadmaps.get(slugify(slugOrTitle));
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
      created: existing?.created ?? now,
      updated: now,
      steps,
    };
    this.roadmaps.set(roadmap.slug, roadmap);
    await this.write(roadmap);
    return { roadmap, created: !existing };
  }

  /** Atomic write (temp file + rename), one write at a time per roadmap. */
  private async write(roadmap: Roadmap) {
    const file = path.join(ROADMAPS_DIR, `${roadmap.slug}.json`);
    const previous = this.saving.get(roadmap.slug) ?? Promise.resolve();
    const next = previous.then(async () => {
      const tmp = `${file}.tmp`;
      await writeFile(tmp, `${JSON.stringify(roadmap, null, 2)}\n`);
      await rename(tmp, file);
    });
    this.saving.set(roadmap.slug, next);
    await next;
    this.events.emit('roadmap', roadmap);
  }
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
    `\nSteps, in order:`,
    lines.join('\n') || '(none)',
  ].join('\n');
}
