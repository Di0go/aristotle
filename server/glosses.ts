// Glosses: phrases he selected because he didn't know them, each with a short explanation written by Claude Code
// on his own login (oneshot.ts). All of them in one file, data/glosses.json.

import { EventEmitter } from 'node:events';
import { GLOSS_IMAGES, GLOSSES_FILE } from './config.ts';
import { type FoundImage, findImages } from './images.ts';
import { OneshotError, oneshot } from './oneshot.ts';
import { slugCandidates, slugify } from './slug.ts';
import { isObject, loadJson, WriteQueue, writeJson } from './store.ts';
import type { Gloss, GlossBody, GlossImage } from '../shared/types.ts';

/** Longer than this is a passage, not a phrase: there is nothing short to say about it. */
export const MAX_PHRASE = 120;
const MAX_CONTEXT = 800;

const SYSTEM =
  'You write glosses for a learner reading a lesson: a short, accurate explanation of a phrase they selected because they ' +
  'did not know it, in the sense the passage uses it. One or two sentences, under 50 words, plain Markdown; inline maths as $...$. ' +
  'Start with the explanation itself: no preamble, no heading, no follow-up offers, and do not mention "the passage". ' +
  'Plain words over jargon; if you must use a technical term, explain it too. If you are not sure, say so briefly rather than guess. ' +
  'You may be given numbered candidate pictures from Wikimedia Commons (title and description only). Only if the phrase names something ' +
  'seen better than described (a body part, an object, an organism, a place, a diagram of a mechanism) AND a candidate clearly shows exactly it, ' +
  'end with a last line "IMAGE: <number>". Otherwise, and whenever in doubt, no such line: a wrong picture is worse than none.';

export class GlossError extends Error {}

export class Glosses {
  private glosses = new Map<string, Gloss>();
  /** Phrases being explained right now, so asking twice runs Claude Code once. */
  private pending = new Map<string, Promise<Gloss>>();
  private queue = new WriteQueue();
  readonly events = new EventEmitter<{ gloss: [Gloss]; removed: [string] }>();

  static async load(): Promise<Glosses> {
    const store = new Glosses();
    for (const g of await loadJson(GLOSSES_FILE, isGlossList, [])) store.glosses.set(g.id, g);
    return store;
  }

  /** Oldest first. */
  all(): Gloss[] {
    return [...this.glosses.values()];
  }

  /** The glosses asked for while reading a topic. */
  of(topic: string): Gloss[] {
    return this.all().filter((g) => g.topic === topic);
  }

  /** The phrase's gloss: the one already written, or a new one from Claude Code. */
  async explain(body: GlossBody, topicTitle?: string): Promise<Gloss> {
    const text = clean(body.text);
    if (!text) throw new GlossError('Select a word or phrase first');
    if (text.length > MAX_PHRASE) throw new GlossError(`Select a shorter phrase (${MAX_PHRASE} characters at most)`);
    const known = this.find(text);
    if (known) return known;
    // Asked again while it is being written: the same answer (by phrase, not id: "C#" and "C++" share a slug).
    const key = fold(text);
    const running = this.pending.get(key);
    if (running) return running;
    const context = body.context ? clean(body.context).slice(0, MAX_CONTEXT) : undefined;
    const topic = body.topic ? slugify(body.topic) : undefined;
    const job = (async () => {
      const candidates = GLOSS_IMAGES
        ? await findImages(text, 5).then(
            (r) => r.images,
            () => [],
          )
        : [];
      const { gloss: written, image } = pickImage(await answer(prompt(text, context, topicTitle, candidates)), candidates, text);
      const gloss: Gloss = {
        id: this.freeId(text),
        text,
        gloss: written,
        ...(context ? { context } : {}),
        ...(topic ? { topic } : {}),
        ...(image ? { image } : {}),
        at: new Date().toISOString(),
      };
      this.glosses.set(gloss.id, gloss);
      await this.write();
      this.events.emit('gloss', gloss);
      return gloss;
    })();
    this.pending.set(key, job);
    try {
      return await job;
    } finally {
      this.pending.delete(key);
    }
  }

  /** Forgets a gloss: he knows it now, or the explanation was poor. */
  async remove(id: string): Promise<boolean> {
    if (!this.glosses.delete(id)) return false;
    await this.write();
    this.events.emit('removed', id);
    return true;
  }

  /** Resolves once every write queued so far has finished. */
  idle(): Promise<void> {
    return this.queue.idle();
  }

  /** The gloss of exactly this phrase, under its id now or before Unicode slugs (or a numbered one, see freeId). */
  private find(text: string): Gloss | undefined {
    const same = (g: Gloss | undefined) => g && sameText(g.text, text);
    for (const base of slugCandidates(text)) {
      for (let n = 1; n <= 50; n++) {
        const g = this.glosses.get(n === 1 ? base : `${base}-${n}`);
        if (same(g)) return g;
      }
    }
    return undefined;
  }

  /** An id for a new phrase: its slug, numbered when another phrase has it ("C#" and "C++" are both "c"). */
  private freeId(text: string): string {
    const base = slugify(text);
    let id = base;
    for (let n = 2; this.glosses.has(id); n++) id = `${base}-${n}`;
    return id;
  }

  /** The whole list, written atomically, one write at a time (store.ts). */
  private async write() {
    const list = this.all();
    await this.queue.run('glosses', () => writeJson(GLOSSES_FILE, list));
  }
}

/** The shape glosses.json must have to be loaded. */
function isGlossList(v: unknown): v is Gloss[] {
  return Array.isArray(v) && v.every((g) => isObject(g) && typeof g.id === 'string' && typeof g.text === 'string');
}

/** The same phrase, whatever its case and accents. */
function sameText(a: string, b: string): boolean {
  return fold(a) === fold(b);
}

/** Lower case, no accents, and spaces, hyphens and underscores alike ("heart-rate" is "heart rate"; "C#" isn't "C++"). */
function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s\-_‐–—]+/g, ' ')
    .trim();
}

/** One line, no runs of spaces, no quotes around it. */
function clean(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“‘(]+|["'”’),.;:]+$/g, '')
    .trim();
}

function prompt(text: string, context?: string, topic?: string, candidates: FoundImage[] = []): string {
  const pictures = candidates.map((c, i) => `${i + 1}. ${c.title}${c.description ? `: ${c.description}` : ''}`);
  return [
    `Phrase: "${text}"`,
    topic ? `Topic: ${topic}` : '',
    context ? `Passage it appears in: "${context}"` : '',
    pictures.length ? `Candidate pictures:\n${pictures.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Splits Claude's "IMAGE: n" line off the gloss, and turns it into the chosen picture. */
function pickImage(out: string, candidates: FoundImage[], text: string): { gloss: string; image?: GlossImage } {
  const m = out.match(/\n?\s*IMAGE:\s*(\d+)\s*$/i);
  const gloss = (m ? out.slice(0, m.index) : out).trim();
  const found = m ? candidates[Number(m[1]) - 1] : undefined;
  if (!found) return { gloss };
  // A card is 320px wide: a 500px rendition (one of Commons' standard sizes) loads in a fraction of the time of 1200px.
  return { gloss, image: { src: found.src.replace(/\/\d+px-/, '/500px-'), page: found.page, credit: found.credit, alt: text } };
}

/** Claude Code's gloss; its failures as gloss errors, so the interface says what went wrong. */
async function answer(request: string): Promise<string> {
  try {
    return await oneshot(SYSTEM, request);
  } catch (err) {
    if (err instanceof OneshotError) throw new GlossError(err.message);
    throw err;
  }
}
