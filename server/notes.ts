// His own words: a notebook per step (what he writes in the panel beside a step, kept with that step) in
// data/notes.json, and his About you page (what he does, his projects, what he wants) in data/about.md. Missions
// and course planning read About you before anything else, so they fit whoever uses Aristotle.

import { EventEmitter } from 'node:events';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ABOUT_FILE, NOTES_FILE } from './config.ts';
import type { StepNote } from '../shared/types.ts';

const MAX_NOTE = 20_000;
const MAX_ABOUT = 20_000;

export class Notes {
  private notes: StepNote[] = [];
  private aboutText = '';
  private saving: Promise<void> = Promise.resolve();
  readonly events = new EventEmitter<{ notes: [StepNote[]]; about: [string] }>();

  static async load(): Promise<Notes> {
    const store = new Notes();
    store.notes = (await readOr(NOTES_FILE, '[]').then(JSON.parse)) as StepNote[];
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
    await this.save(NOTES_FILE, `${JSON.stringify(this.notes, null, 2)}\n`);
    this.events.emit('notes', this.notes);
    return note;
  }

  async setAbout(text: string) {
    this.aboutText = text.slice(0, MAX_ABOUT);
    await this.save(ABOUT_FILE, this.aboutText.endsWith('\n') || !this.aboutText ? this.aboutText : `${this.aboutText}\n`);
    this.events.emit('about', this.aboutText);
  }

  /** Atomic write (temp file + rename), one at a time. */
  private async save(file: string, body: string) {
    this.saving = this.saving.then(async () => {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(`${file}.tmp`, body);
      await rename(`${file}.tmp`, file);
    });
    await this.saving;
  }
}

async function readOr(file: string, fallback: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}
