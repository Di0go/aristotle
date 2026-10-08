// The learner's own words: a notebook per step (what they write in the panel beside a step, kept with that step) in
// data/notes.json, and their About you page (what they do, their projects, what they want) in data/about.md. Missions
// and course planning read About you before anything else, so they fit whoever uses Aristotle. Beside them, the
// tutor's own notes on how they learn, data/profile.md (the MCP tool `profile`).

import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { ABOUT_FILE, NOTES_FILE, PROFILE_FILE } from './config.ts';
import { isObject, loadJson, WriteQueue, writeFileAtomic, writeJson } from './store.ts';
import type { StepNote } from '../shared/types.ts';

const MAX_NOTE = 20_000;
const MAX_ABOUT = 20_000;
const MAX_PROFILE = 20_000;

export class Notes {
  private notes: StepNote[] = [];
  private aboutText = '';
  private queue = new WriteQueue();
  readonly events = new EventEmitter<{ note: [StepNote]; removed: [{ topic: string; step: string }]; about: [string] }>();

  static async load(): Promise<Notes> {
    const store = new Notes();
    store.notes = await loadJson(NOTES_FILE, isNoteList, []);
    store.aboutText = await readOr(ABOUT_FILE, '');
    return store;
  }

  all(): StepNote[] {
    return this.notes;
  }

  of(topic: string): StepNote[] {
    return this.notes.filter((n) => n.topic === topic);
  }

  about(): string {
    return this.aboutText;
  }

  /** Keeps what he wrote on a step; an empty notebook is removed. */
  async write(topic: string, step: string, text: string, title?: string): Promise<StepNote | null> {
    const clean = text.slice(0, MAX_NOTE);
    const rest = this.notes.filter((n) => !(n.topic === topic && n.step === step));
    const note = clean.trim()
      ? { topic, step, ...(title ? { title: title.slice(0, 200) } : {}), text: clean, updated: new Date().toISOString() }
      : null;
    this.notes = note ? [...rest, note] : rest;
    const list = this.notes;
    await this.queue.run(NOTES_FILE, () => writeJson(NOTES_FILE, list));
    if (note) this.events.emit('note', note);
    else this.events.emit('removed', { topic, step });
    return note;
  }

  async setAbout(text: string) {
    this.aboutText = text.slice(0, MAX_ABOUT);
    const body = this.aboutText.endsWith('\n') || !this.aboutText ? this.aboutText : `${this.aboutText}\n`;
    await this.queue.run(ABOUT_FILE, () => writeFileAtomic(ABOUT_FILE, body));
    this.events.emit('about', this.aboutText);
  }

  /**
   * The tutor's notes on how they learn. Read from the file every time: a Claude Code from before the profile tool
   * edits the file itself.
   */
  profile(): Promise<string> {
    return readOr(PROFILE_FILE, '');
  }

  async setProfile(text: string) {
    const body = text.slice(0, MAX_PROFILE).trim();
    await this.queue.run(PROFILE_FILE, () => writeFileAtomic(PROFILE_FILE, body ? `${body}\n` : ''));
  }

  /** Resolves once every write queued so far has finished. */
  idle(): Promise<void> {
    return this.queue.idle();
  }
}

/** The shape notes.json must have to be loaded. */
function isNoteList(v: unknown): v is StepNote[] {
  return Array.isArray(v) && v.every((n) => isObject(n) && typeof n.topic === 'string' && typeof n.step === 'string');
}

async function readOr(file: string, fallback: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}
