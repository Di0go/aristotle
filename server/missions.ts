// Praxis missions: one JSON file per mission in data/missions/. A mission takes what a step (or a whole
// roadmap) taught out into his life; his debrief and Claude's review close it.

import { EventEmitter } from 'node:events';
import path from 'node:path';
import { MISSIONS_DIR } from './config.ts';
import { slugCandidates, slugify } from './slug.ts';
import { isObject, loadJsonDir, WriteQueue, writeJson } from './store.ts';
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

/** A request that makes no sense for this mission; the API answers it with a 400. */
export class MissionError extends Error {}

const SCOPE = { step: 'step mission', capstone: 'capstone', topic: 'topic mission' } as const;

export class Missions {
  private missions = new Map<string, Mission>();
  private queue = new WriteQueue();
  readonly events = new EventEmitter<{ mission: [Mission] }>();

  static async load(): Promise<Missions> {
    const store = new Missions();
    for (const mission of await loadJsonDir(MISSIONS_DIR, isMission)) store.missions.set(mission.id, mission);
    return store;
  }

  /** By id, or by a title that slugifies to one (as it does now, or did before Unicode slugs). */
  get(id: string): Mission | undefined {
    return (
      this.missions.get(id) ??
      slugCandidates(id)
        .map((s) => this.missions.get(s))
        .find(Boolean)
    );
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
    // A new mission never takes over an old one's file: a repeated title gets -2, -3 and so on.
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
    // Where it belongs is replaced, not merged: a rewrite may move it to another step or roadmap.
    delete mission.roadmap;
    delete mission.topic;
    if (input.roadmap) mission.roadmap = input.roadmap;
    if (input.topic) mission.topic = input.topic;
    await this.write(mission);
    return { mission, created: !existing };
  }

  /** Saves his account of how it went. */
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

  /** Saves Claude's verdict and critique, which close the mission. */
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

  /** Resolves once every write queued so far has finished. */
  idle(): Promise<void> {
    return this.queue.idle();
  }

  /** Atomic write, one write at a time per mission (store.ts). */
  private async write(mission: Mission) {
    this.missions.set(mission.id, mission);
    await this.queue.run(mission.id, () => writeJson(path.join(MISSIONS_DIR, `${mission.id}.json`), mission));
    this.events.emit('mission', mission);
  }
}

/** The shape a mission file must have to be loaded. */
function isMission(v: unknown): v is Mission {
  return isObject(v) && typeof v.id === 'string' && typeof v.title === 'string' && Array.isArray(v.criteria);
}

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
    m.debrief ? `\nTheir debrief (${m.debrief.at.slice(0, 16).replace('T', ' ')}):\n${m.debrief.text}` : '\nNo debrief yet.',
    m.review ? `\nYour review (${m.review.at.slice(0, 10)}, ${m.review.verdict}):\n${m.review.markdown}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
