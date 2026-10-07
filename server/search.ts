// Search across everything he has: roadmaps and their steps, topics and their concepts, Praxis missions,
// and the text of every session (steps, questions and his answers). Words match anywhere, in any order,
// ignoring case and accents; matches in a title rank above matches in the body.

import type { SessionRecord } from './feed.ts';
import type { Gym } from './gym.ts';
import type { SearchHit } from '../shared/types.ts';

/** One searchable thing, with its text folded once, when it is indexed, not at every query. */
export interface Doc {
  hit: SearchHit;
  title: string;
  body: string;
  /** The title, folded (see fold). */
  foldedTitle: string;
  /** Title and body, folded. */
  folded: string;
  /** Ties: newer first. */
  at: string;
}

/** Lower case without accents, so "Café" matches "cafe". */
const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A document, with its folded text worked out now. */
function doc(hit: SearchHit, title: string, body: string, at: string): Doc {
  const foldedTitle = fold(title);
  return { hit, title, body, foldedTitle, folded: `${foldedTitle} ${fold(body)}`, at };
}

export class Search {
  private gym: Gym;
  /** Roadmaps, topics, concepts and missions as documents, rebuilt only when one of them changes. */
  private cached: { version: number; docs: Doc[] } | undefined;

  constructor(gym: Gym) {
    this.gym = gym;
  }

  /** Hits containing every word of `q`, best first: title starts, then word starts, then anywhere. */
  async query(q: string, limit = 40): Promise<SearchHit[]> {
    const words = fold(q).split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const scored: { doc: Doc; score: number }[] = [];
    const library = this.library();
    const sessionDocs = await this.gym.sessionDocs();
    for (const docs of [library, sessionDocs])
      for (const doc of docs) {
        const title = doc.foldedTitle;
        if (!words.every((w) => doc.folded.includes(w))) continue;
        let score = 0;
        for (const w of words) {
          if (title.startsWith(w)) score += 4;
          else if (new RegExp(`\\b${escapeRegExp(w)}`).test(title)) score += 3;
          else if (title.includes(w)) score += 2;
        }
        // The places themselves before what was said in sessions.
        if (doc.hit.kind !== 'session') score += 1;
        scored.push({ doc, score });
      }
    scored.sort((a, b) => b.score - a.score || b.doc.at.localeCompare(a.doc.at));
    return scored.slice(0, limit).map(({ doc }) => {
      const inTitle = words.every((w) => doc.foldedTitle.includes(w));
      const snip = inTitle ? doc.hit.snippet : snippet(doc.body, words);
      return { ...doc.hit, ...(snip ? { snippet: snip } : {}) };
    });
  }

  /** Roadmaps, steps, topics, concepts and missions, read live (and kept until one of them changes). */
  private library(): Doc[] {
    if (this.cached?.version === this.gym.libraryVersion) return this.cached.docs;
    const docs: Doc[] = [];
    for (const r of this.gym.roadmaps.all()) {
      docs.push(doc({ kind: 'roadmap', title: r.title, slug: r.slug, snippet: r.goal }, r.title, r.goal, r.updated));
      for (const [i, s] of r.steps.entries()) {
        docs.push(
          doc(
            { kind: 'step', title: s.title, slug: s.topic, context: `${r.title} · step ${i + 1}`, snippet: s.goal },
            s.title,
            `${s.goal} ${s.why ?? ''}`,
            r.updated,
          ),
        );
      }
    }
    const steps = new Set(this.gym.roadmaps.all().flatMap((r) => r.steps.map((s) => s.topic)));
    for (const t of this.gym.topics.all()) {
      // A step already stands for its topic.
      if (!steps.has(t.slug)) docs.push(doc({ kind: 'topic', title: t.title, slug: t.slug, snippet: t.goal }, t.title, t.goal, t.updated));
      for (const c of t.concepts) {
        docs.push(
          doc(
            {
              kind: 'concept',
              title: c.label,
              slug: t.slug,
              concept: c.id,
              context: t.title,
              ...(c.summary ? { snippet: c.summary } : {}),
            },
            c.label,
            `${c.summary ?? ''} ${c.note ?? ''}`,
            c.updated,
          ),
        );
      }
    }
    for (const m of this.gym.missions.all()) {
      docs.push(
        doc(
          { kind: 'mission', title: m.title, id: m.id, context: m.arena, snippet: m.why },
          m.title,
          plain(`${m.why} ${m.brief} ${m.criteria.join('. ')} ${m.debrief?.text ?? ''} ${m.review?.markdown ?? ''}`),
          m.updated,
        ),
      );
    }
    this.cached = { version: this.gym.libraryVersion, docs };
    return docs;
  }
}

/** One document per step, question, quiz and handoff in a session (gym.ts keeps them, per session log). */
export function indexSession(id: string, record: SessionRecord): Doc[] {
  const s = record.session;
  if (!s) return [];
  const context = `${s.topic} · ${s.startedAt.slice(0, 10)}`;
  const one = (title: string, body: string, at: string): Doc => doc({ kind: 'session', title, slug: id, context }, title, body, at);
  const docs: Doc[] = [];
  for (const item of record.items) {
    if (item.type === 'block') {
      docs.push(one(item.title ?? s.goal, plain(item.markdown), item.at));
    } else if (item.type === 'ask') {
      const title = item.kind === 'problem' ? 'Problem' : 'Question';
      docs.push(one(title, plain(`${item.prompt} ${item.response ?? ''}`), item.at));
    } else if (item.type === 'quiz') {
      // An unanswered quiz keeps its answers hidden here too.
      const text = item.questions.map((q) => (item.answeredAt ? `${q.question} ${q.explanation}` : q.question)).join(' ');
      docs.push(one('Quiz', plain(text), item.at));
    }
  }
  const h = record.handoff;
  if (h) docs.push(one('Done for now', `${h.locked} ${h.shaky} ${h.next}`, h.at));
  return docs;
}

/** Markdown down to the words: no fences, LaTeX delimiters, links, tags or markup characters. */
function plain(md: string): string {
  return md
    .replace(/```[a-z]*\s*\{[\s\S]*?```/g, ' ') // kit and explorable blocks are JSON
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, a, b) => b || a)
    .replace(/\{\{([^}|]+)\|[^}]*\}\}/g, '$1')
    .replace(/^>\s*\[![a-z]+\]/gm, '')
    .replace(/[*_`#>=~$\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Text around the first matching word, with an ellipsis where it was cut. */
function snippet(text: string, words: string[]): string | undefined {
  if (!text) return undefined;
  const folded = fold(text);
  const at = Math.min(...words.map((w) => folded.indexOf(w)).filter((i) => i >= 0));
  if (!Number.isFinite(at)) return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  const start = Math.max(0, at - 50);
  const end = Math.min(text.length, at + 110);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
