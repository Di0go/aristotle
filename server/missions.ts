// Praxis missions: one JSON file per mission in data/missions/. A mission takes what a step (or a whole
// roadmap) taught out into his life; his debrief and Claude's review close it.

import { EventEmitter } from 'node:events';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MISSIONS_DIR } from './config.ts';
import { slugify } from './slug.ts';
import type { Mission, MissionScope, MissionVerdict } from '../shared/types.ts';

export interface MissionInput {
  title: string;
  scope: MissionScope;
  roadmap?: string;
  topic?: string;
  arena: string;
  brief: string;
  why: string;
  criteria: string[];
  concepts: string[];
}

export class Missions {
  private missions = new Map<string, Mission>();
  private saving = new Map<string, Promise<void>>();
  readonly events = new EventEmitter<{ mission: [Mission] }>();

  static async load(): Promise<Missions> {
    const store = new Missions();
    await mkdir(MISSIONS_DIR, { recursive: true });
    for (const file of await readdir(MISSIONS_DIR)) {
      if (!file.endsWith('.json')) continue;
      const mission = JSON.parse(await readFile(path.join(MISSIONS_DIR, file), 'utf8')) as Mission;
      store.missions.set(mission.id, mission);
    }
    return store;
  }

  get(id: string): Mission | undefined {
    return this.missions.get(id) ?? this.missions.get(slugify(id));
  }

  /** Newest first. */
  all(): Mission[] {
    return [...this.missions.values()].sort((a, b) => b.created.localeCompare(a.created));
  }

  /** The missions of a roadmap step (by topic) or of a whole roadmap (its capstone). */
  of(where: { topic?: string; roadmap?: string; scope?: MissionScope }): Mission[] {
    return this.all().filter(
      (m) =>
        (!where.topic || m.topic === where.topic) &&
        (!where.roadmap || m.roadmap === where.roadmap) &&
        (!where.scope || m.scope === where.scope),
    );
  }

  /** Creates a mission, or rewrites the brief of an existing one (which keeps its debrief and review). */
  async save(input: MissionInput, id?: string): Promise<{ mission: Mission; created: boolean }> {
    const now = new Date().toISOString();
    const existing = id ? this.get(id) : undefined;
    let newId = existing?.id ?? slugify(input.title);
    for (let n = 2; !existing && this.missions.has(newId); n++) newId = `${slugify(input.title)}-${n}`;
    const mission: Mission = {
      ...existing,
      id: newId,
      title: input.title,
      scope: input.scope,
      arena: input.arena,
      brief: input.brief,
      why: input.why,
      criteria: input.criteria,
      concepts: input.concepts,
      status: existing?.status ?? 'open',
      created: existing?.created ?? now,
      updated: now,
    };
    delete mission.roadmap;
    delete mission.topic;
    if (input.roadmap) mission.roadmap = input.roadmap;
    if (input.topic) mission.topic = input.topic;
    await this.write(mission);
    return { mission, created: !existing };
  }

  async debrief(id: string, text: string): Promise<Mission> {
    const mission = this.require(id);
    if (mission.status === 'dropped') throw new MissionError('This mission was dropped.');
    const now = new Date().toISOString();
    mission.debrief = { at: now, text };
    // A new debrief after a review asks for another look.
    mission.status = 'debriefed';
    mission.updated = now;
    await this.write(mission);
    return mission;
  }

  async review(id: string, verdict: MissionVerdict, markdown: string): Promise<Mission> {
    const mission = this.require(id);
    const now = new Date().toISOString();
    mission.review = { at: now, verdict, markdown };
    mission.status = 'reviewed';
    mission.updated = now;
    await this.write(mission);
    return mission;
  }

  /** Drops a mission, or brings a dropped one back. */
  async setDropped(id: string, dropped: boolean): Promise<Mission> {
    const mission = this.require(id);
    mission.status = dropped ? 'dropped' : mission.review ? 'reviewed' : mission.debrief ? 'debriefed' : 'open';
    mission.updated = new Date().toISOString();
    await this.write(mission);
    return mission;
  }

  private require(id: string): Mission {
    const mission = this.get(id);
    if (!mission) throw new MissionError(`No mission "${id}"`);
    return mission;
  }

  /** Atomic write (temp file + rename), one write at a time per mission. */
  private async write(mission: Mission) {
    this.missions.set(mission.id, mission);
    const file = path.join(MISSIONS_DIR, `${mission.id}.json`);
    const previous = this.saving.get(mission.id) ?? Promise.resolve();
    const next = previous.then(async () => {
      const tmp = `${file}.tmp`;
      await writeFile(tmp, `${JSON.stringify(mission, null, 2)}\n`);
      await rename(tmp, file);
    });
    this.saving.set(mission.id, next);
    await next;
    this.events.emit('mission', mission);
  }
}

export class MissionError extends Error {}

const SCOPE = { step: 'step mission', capstone: 'capstone', topic: 'topic mission' } as const;

/** One line per mission, as Claude reads a list of them. */
export function summarizeMission(m: Mission): string {
  const where = m.scope === 'capstone' ? `roadmap ${m.roadmap}` : m.topic ? `topic ${m.topic}` : '';
  const verdict = m.review ? `, ${m.review.verdict}` : '';
  return `- ${m.id}: "${m.title}" (${SCOPE[m.scope]}${where ? `, ${where}` : ''}; in ${m.arena}) [${m.status}${verdict}]`;
}

/** The whole mission as Claude reads it, debrief included. */
export function describeMission(m: Mission): string {
  return [
    summarizeMission(m).slice(2),
    `Why: ${m.why}`,
    `Concepts: ${m.concepts.join(', ') || '(none)'}`,
    `\nBrief:\n${m.brief}`,
    `\nDone when:\n${m.criteria.map((c) => `- ${c}`).join('\n')}`,
    m.debrief ? `\nHis debrief (${m.debrief.at.slice(0, 16).replace('T', ' ')}):\n${m.debrief.text}` : '\nNo debrief yet.',
    m.review ? `\nYour review (${m.review.at.slice(0, 10)}, ${m.review.verdict}):\n${m.review.markdown}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
