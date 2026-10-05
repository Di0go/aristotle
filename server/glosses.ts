// Glosses: phrases he selected because he didn't know them, each with a short explanation written by Claude Code
// on his own login (`claude -p`, no tools). All of them in one file, data/glosses.json.

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GLOSS_CMD, GLOSS_IMAGES, GLOSS_MODEL, GLOSSES_FILE } from './config.ts';
import { type FoundImage, findImages } from './images.ts';
import { slugify } from './slug.ts';
import type { Gloss, GlossBody, GlossImage } from '../shared/types.ts';

/** Longer than this is a passage, not a phrase: there is nothing short to say about it. */
export const MAX_PHRASE = 120;
const MAX_CONTEXT = 800;
/** Claude Code usually answers in about five seconds; past this, something is wrong. */
const TIMEOUT_MS = 60_000;

const SYSTEM =
  'You write glosses for a learner reading a lesson: a short, accurate explanation of a phrase he selected because he ' +
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
  private saving: Promise<void> = Promise.resolve();
  readonly events = new EventEmitter<{ glosses: [Gloss[]] }>();

  static async load(): Promise<Glosses> {
    const store = new Glosses();
    try {
      for (const g of JSON.parse(await readFile(GLOSSES_FILE, 'utf8')) as Gloss[]) store.glosses.set(g.id, g);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
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
    const id = slugify(text);
    if (!id) throw new GlossError('There is nothing to explain in that selection');
    const known = this.glosses.get(id);
    if (known) return known;
    const running = this.pending.get(id);
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
      const { gloss: written, image } = pickImage(await ask(prompt(text, context, topicTitle, candidates)), candidates, text);
      const gloss: Gloss = {
        id,
        text,
        gloss: written,
        ...(context ? { context } : {}),
        ...(topic ? { topic } : {}),
        ...(image ? { image } : {}),
        at: new Date().toISOString(),
      };
      this.glosses.set(id, gloss);
      await this.write();
      return gloss;
    })();
    this.pending.set(id, job);
    try {
      return await job;
    } finally {
      this.pending.delete(id);
    }
  }

  /** Forgets a gloss: he knows it now, or the explanation was poor. */
  async remove(id: string): Promise<boolean> {
    if (!this.glosses.delete(id)) return false;
    await this.write();
    return true;
  }

  /** Atomic write (temp file + rename), one at a time. */
  private async write() {
    const list = this.all();
    this.saving = this.saving.then(async () => {
      await mkdir(path.dirname(GLOSSES_FILE), { recursive: true });
      const tmp = `${GLOSSES_FILE}.tmp`;
      await writeFile(tmp, `${JSON.stringify(list, null, 2)}\n`);
      await rename(tmp, GLOSSES_FILE);
    });
    await this.saving;
    this.events.emit('glosses', list);
  }
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

/**
 * Runs Claude Code headless with the request on stdin: no tools, no MCP servers, no settings or hooks, no saved
 * session, from a neutral folder so no project's CLAUDE.md is read. Whatever it prints is the gloss.
 */
function ask(request: string): Promise<string> {
  const args = GLOSS_CMD
    ? GLOSS_CMD.split(' ')
    : [
        'claude',
        '-p',
        '--model',
        GLOSS_MODEL,
        '--tools',
        '',
        '--strict-mcp-config',
        '--setting-sources',
        '',
        '--no-session-persistence',
        '--system-prompt',
        SYSTEM,
      ];
  const [file, ...rest] = args;
  const home = os.homedir();
  return new Promise((resolve, reject) => {
    const child = spawn(file, rest, {
      cwd: os.tmpdir(),
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: TIMEOUT_MS,
      // A service started at login may not have the user's PATH; Claude Code lives in ~/.local/bin.
      env: { ...process.env, PATH: [path.join(home, '.local/bin'), process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin'].join(':') },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => reject(new GlossError(`Could not start Claude Code: ${e.message}`)));
    child.on('close', (code, signal) => {
      const text = out.trim();
      if (code === 0 && text) return resolve(text);
      if (signal) return reject(new GlossError('Claude Code took too long to answer'));
      reject(new GlossError(`Claude Code could not write a gloss${err.trim() ? `: ${err.trim().split('\n').at(-1)}` : ''}`));
    });
    child.stdin.end(request);
  });
}
