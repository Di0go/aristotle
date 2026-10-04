// Ties the live feed to the knowledge maps: answers become evidence on concepts,
// map changes show up in the feed, and ending a session leaves a handoff on the topic.

import { stat } from 'node:fs/promises';
import path from 'node:path';
import { SESSIONS_DIR } from './config.ts';
import { Feed, readSession, sessionFiles, summarizeSession } from './feed.ts';
import { Topics, type ConceptInput } from './topics.ts';
import type { AskItem, Handoff, MapChange, QuizItem, SessionSummary } from '../shared/types.ts';

export class Gym {
  private summaries = new Map<string, { mtime: number; summary: SessionSummary | null }>();

  readonly feed: Feed;
  readonly topics: Topics;

  constructor(feed: Feed, topics: Topics) {
    this.feed = feed;
    this.topics = topics;
    topics.events.on('topic', (topic) => feed.events.emit('event', { type: 'topic', topic }));
  }

  static async load(): Promise<Gym> {
    return new Gym(await Feed.load(), await Topics.load());
  }

  /** The current session's topic, if it exists on the map. */
  currentTopic() {
    const slug = this.feed.session?.topicSlug;
    return slug ? this.topics.get(slug) : undefined;
  }

  async startSession(topicName: string, goal: string, topicGoal?: string) {
    const { topic, created } = await this.topics.ensure(topicName, topicGoal ?? goal);
    const session = await this.feed.startSession(topic.title, topic.slug, goal);
    await this.topics.addSession(topic.slug, session.id);
    return { session, topic, created };
  }

  async updateMap(inputs: ConceptInput[], remove: string[], focus?: string, topicSlug?: string): Promise<MapChange[]> {
    const topic = topicSlug ? this.topics.get(topicSlug) : this.currentTopic();
    if (!topic) throw new Error(topicSlug ? `No topic "${topicSlug}"` : 'No session: call start_session first.');
    const changes = await this.topics.update(topic.slug, inputs, remove, focus);
    if (changes.length && this.feed.session) await this.feed.add({ type: 'map', topic: topic.slug, changes });
    return changes;
  }

  async focus(concept: string) {
    const topic = this.currentTopic();
    if (topic) await this.topics.setFocus(topic.slug, concept);
  }

  async answerQuiz(id: string, picks: { choice: number | null; note?: string }[]): Promise<QuizItem> {
    const item = await this.feed.answerQuiz(id, picks);
    const topic = this.currentTopic();
    const session = this.feed.session;
    if (topic && session) {
      for (const [i, q] of item.questions.entries()) {
        const r = item.responses?.[i];
        if (!q.concept || !r) continue;
        const result = r.choice === null ? 'dont-know' : r.correct ? 'right' : 'wrong';
        await this.topics.recordEvidence(topic.slug, q.concept, {
          at: item.answeredAt!,
          session: session.id,
          item: item.id,
          kind: 'quiz',
          result,
        });
      }
    }
    return item;
  }

  async answerAsk(id: string, text: string): Promise<AskItem> {
    const item = await this.feed.answerAsk(id, text);
    const topic = this.currentTopic();
    const session = this.feed.session;
    if (topic && session && item.concept) {
      await this.topics.recordEvidence(topic.slug, item.concept, {
        at: item.answeredAt!,
        session: session.id,
        item: item.id,
        kind: 'ask',
      });
    }
    return item;
  }

  async endSession(locked: string, shaky: string, next: string): Promise<Handoff> {
    const session = this.feed.session;
    if (!session) throw new Error('No session to end.');
    const handoff: Handoff = { at: new Date().toISOString(), session: session.id, locked, shaky, next };
    await this.feed.add({
      type: 'block',
      kind: 'summary',
      title: 'Done for now',
      markdown: `**Locked in:** ${locked}\n\n**Still shaky:** ${shaky}\n\n**Next time:** ${next}`,
    });
    await this.feed.endSession(handoff);
    if (this.topics.get(session.topicSlug)) await this.topics.setHandoff(session.topicSlug, handoff);
    return handoff;
  }

  /** Every session, newest first. Summaries are cached by file modification time. */
  async listSessions(topicSlug?: string): Promise<SessionSummary[]> {
    const out: SessionSummary[] = [];
    for (const name of await sessionFiles()) {
      const file = path.join(SESSIONS_DIR, name);
      const mtime = (await stat(file)).mtimeMs;
      let cached = this.summaries.get(file);
      if (!cached || cached.mtime !== mtime) {
        cached = { mtime, summary: summarizeSession(await readSession(file)) };
        this.summaries.set(file, cached);
      }
      if (cached.summary && (!topicSlug || cached.summary.topicSlug === topicSlug)) out.push(cached.summary);
    }
    return out.reverse();
  }

  async readSession(id: string) {
    if (!/^[\w-]+$/.test(id)) return null;
    try {
      return await readSession(path.join(SESSIONS_DIR, `${id}.jsonl`));
    } catch {
      return null;
    }
  }
}
