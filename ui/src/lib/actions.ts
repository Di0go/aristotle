// Starting things from the interface: each action asks the Claude Code running in Aristotle to run a skill.
// A running Claude gets the slash command; a fresh one starts with the same request in words, because an
// opening message that begins with "/" is left in the input box instead of being sent.

import { claude } from './claude.svelte.ts';
import { feed } from './feed.svelte.ts';
import { link } from './router.svelte.ts';
import type { Roadmap } from '../../../shared/types.ts';

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Lessons, reviews and training open a session, so they move to Now. Planning a roadmap is a conversation:
 * it stays on the page (where the draft appears) and opens Claude beside it. */
function go(command: string, initial: string, label: string, converse = false) {
  claude.run(command, initial);
  if (converse) {
    claude.toggle(true);
    return;
  }
  feed.begin(label);
  if (location.hash !== link.now() && location.hash !== '') location.hash = link.now();
}

export const actions = {
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
    go(`/teach ${what}${want}`, `Use the teach skill to teach me: ${what}${want}`, `A lesson on ${what}`);
  },
  /** A step's topic is named after the step, so the lesson must use the title exactly. */
  startStep(roadmap: Roadmap, index: number, said = '') {
    const step = roadmap.steps[index];
    const words = oneLine(said) ? ` I said: "${oneLine(said)}"` : '';
    const what = `"${step.title}", step ${index + 1} of my roadmap ${roadmap.slug}. Use exactly that title as the topic title. What I want from it: ${oneLine(step.goal)}.${words}`;
    go(`/teach ${what}`, `Use the teach skill to teach me ${what}`, `Step ${index + 1} of ${roadmap.title}: ${step.title}`);
  },
  planRoadmap(area: string, goal = '') {
    const what = oneLine(area);
    const want = oneLine(goal) ? `. What I want from it: ${oneLine(goal)}` : '';
    go(`/roadmap ${what}${want}`, `Use the roadmap skill to plan a roadmap with me: ${what}${want}`, `Planning a roadmap: ${what}`, true);
  },
  editRoadmap(slug: string) {
    go(`/roadmap change ${slug}`, `Use the roadmap skill: I want to change my roadmap ${slug}.`, 'Changing the roadmap', true);
  },
  /** Continue a topic's lesson; what he typed, if anything, goes along as his first words. */
  continueTopic(slug: string, said = '') {
    const words = oneLine(said) ? ` I said: "${oneLine(said)}"` : '';
    go(`/teach continue ${slug}.${words}`, `Use the teach skill to continue the topic ${slug} where I left off.${words}`, `Continuing ${feed.topics[slug]?.title ?? slug}`);
  },
  train(slug: string) {
    go(`/train ${slug}`, `Use the train skill: a training set on the topic ${slug}.`, `Training: ${feed.topics[slug]?.title ?? slug}`);
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
    go(`/praxis topic ${slug}`, `Use the praxis skill: design a mission for the topic ${slug}.`, 'A Praxis mission', true);
  },
  capstone(roadmap: Roadmap) {
    go(`/praxis capstone ${roadmap.slug}`, `Use the praxis skill: design the capstone mission for my roadmap ${roadmap.slug}.`, `The capstone of ${roadmap.title}`, true);
  },
  reviewMission(id: string) {
    go(`/praxis review ${id}`, `Use the praxis skill: review my debrief of the mission ${id}.`, 'Reviewing a mission', true);
  },
  review(slug?: string) {
    go(
      slug ? `/review ${slug}` : '/review',
      slug ? `Use the review skill to review what's fading in the topic ${slug}.` : "Use the review skill to review what's fading.",
      'A review of what is fading',
    );
  },
};
