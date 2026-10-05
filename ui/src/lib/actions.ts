// Starting things from the interface: each action asks the Claude Code running in Aristotle to run a skill.
// A running Claude gets the slash command; a fresh one starts with the same request in words, because an
// opening message that begins with "/" is left in the input box instead of being sent.

import { claude } from './claude.svelte.ts';
import { feed } from './feed.svelte.ts';
import { link, router } from './router.svelte.ts';
import type { Roadmap } from '../../../shared/types.ts';

export const actions = {
  /**
   * Sends his answer to a quiz or an ask; an error message, or null. When no tool call was waiting for it (the
   * session ended, or the wait ran out), Claude is told to collect it and carry on, once nothing else is open.
   */
  async answer(body: unknown): Promise<string | null> {
    const result = await feed.answer(body);
    if ('error' in result) return result.error;
    if (!result.heard && !feed.items.some((i) => (i.type === 'quiz' || i.type === 'ask') && !i.answeredAt)) pickUp();
    return null;
  },
  /** Ask Claude to wrap up: the map, then the handoff. Typed in even while it works (Claude Code queues it). */
  stopForToday(): boolean {
    if (!claude.running) return false;
    feed.wrapping = true;
    claude.say("Let's stop for today. Please wrap up now: update the map, then end the session with a handoff.");
    return true;
  },
  learn(topic: string, goal = '') {
    const what = oneLine(topic);
    const want = oneLine(goal) ? `. What I want from it: ${oneLine(goal)}` : '';
    go(`/teach ${what}${want}`, `Use the teach skill to teach me: ${what}${want}`, `A class on ${what}`);
  },
  /** A step's topic is named after the step, so the lesson must use the title exactly. */
  startStep(roadmap: Roadmap, index: number, said = '') {
    const step = roadmap.steps[index];
    const words = oneLine(said) ? ` I said: "${oneLine(said)}"` : '';
    const what = `"${step.title}", step ${index + 1} of my roadmap ${roadmap.slug}. Use exactly that title as the topic title. What I want from it: ${oneLine(step.goal)}.${words}`;
    go(
      `/teach ${what}`,
      `Use the teach skill to teach me ${what}`,
      `Step ${index + 1} of ${roadmap.title}: ${step.title}`,
      false,
      step.topic,
    );
  },
  planRoadmap(area: string, goal = '') {
    const what = oneLine(area);
    const want = oneLine(goal) ? `. What I want from it: ${oneLine(goal)}` : '';
    go(`/roadmap ${what}${want}`, `Use the roadmap skill to plan a roadmap with me: ${what}${want}`, `Planning a course: ${what}`, true);
  },
  editRoadmap(slug: string) {
    go(`/roadmap change ${slug}`, `Use the roadmap skill: I want to change my roadmap ${slug}.`, 'Changing the course', true);
  },
  /** Continue a topic's lesson; what he typed, if anything, goes along as his first words. */
  continueTopic(slug: string, said = '') {
    const words = oneLine(said) ? ` I said: "${oneLine(said)}"` : '';
    go(
      `/teach continue ${slug}.${words}`,
      `Use the teach skill to continue the topic ${slug} where I left off.${words}`,
      `Continuing ${feed.topics[slug]?.title ?? slug}`,
      false,
      slug,
    );
  },
  train(slug: string) {
    go(
      `/train ${slug}`,
      `Use the train skill: a training set on the topic ${slug}.`,
      `Training: ${feed.topics[slug]?.title ?? slug}`,
      false,
      undefined,
      'other',
    );
  },
  /** Praxis is a conversation (which arena, what fits his life), so it stays on the page with Claude beside it. */
  stepMission(roadmap: Roadmap, index: number) {
    const step = roadmap.steps[index];
    go(
      `/praxis step ${index + 1} of ${roadmap.slug} (topic ${step.topic})`,
      `Use the praxis skill: design a mission for step ${index + 1} of my roadmap ${roadmap.slug} (topic ${step.topic}).`,
      `A mission for ${step.title}`,
      true,
    );
  },
  topicMission(slug: string) {
    go(`/praxis topic ${slug}`, `Use the praxis skill: design a mission for the topic ${slug}.`, 'A mission', true);
  },
  capstone(roadmap: Roadmap) {
    go(
      `/praxis capstone ${roadmap.slug}`,
      `Use the praxis skill: design the capstone mission for my roadmap ${roadmap.slug}.`,
      `The capstone of ${roadmap.title}`,
      true,
    );
  },
  reviewMission(id: string) {
    go(`/praxis review ${id}`, `Use the praxis skill: review my debrief of the mission ${id}.`, 'Reviewing a mission', true);
  },
  review(slug?: string) {
    go(
      slug ? `/review ${slug}` : '/review',
      slug ? `Use the review skill to review what's fading in the topic ${slug}.` : "Use the review skill to review what's fading.",
      'A review of what is fading',
      false,
      undefined,
      'other',
    );
  },
};

/**
 * Claude picks up answers it wasn't waiting for: told to collect them if its session is still going here, or
 * asked to continue (which collects them first) when the session has ended or Claude Code isn't running.
 */
function pickUp() {
  const session = feed.session;
  if (!session) return;
  if (!session.endedAt && claude.running) {
    claude.say("I've answered. Please collect my answers with collect_answers and carry on.");
    return;
  }
  const said = 'I answered the questions left open last time.';
  if (session.kind === 'review') actions.review();
  else if (session.kind === 'train') actions.train(session.topicSlug);
  else actions.continueTopic(session.topicSlug, said);
}

/**
 * A lesson waits on its class and moves to the step being taught when it starts; reviews and training open on Home.
 * Planning a roadmap or a mission is a conversation: it stays on the page (where the draft appears) and opens Claude beside it.
 */
function go(command: string, initial: string, label: string, converse = false, topic?: string, kind: 'learn' | 'other' = 'learn') {
  claude.run(command, initial);
  if (converse) {
    claude.toggle(true);
    return;
  }
  feed.begin(label);
  // A lesson happens in its class: wait on the class (or Home, for a topic not known yet), and go to the step being
  // taught once it starts. Reviews and training sets have no class: they open on Home.
  feed.follow = kind === 'learn' ? (topic ?? '*') : null;
  const route = router.route;
  if (topic && (route.page === 'lesson' || route.page === 'step') && route.slug === topic) return;
  location.hash = kind === 'learn' && topic ? link.lesson(topic) : link.now();
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
