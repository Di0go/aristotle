// Starting things from the interface: each action asks the tutor running in Aristotle to run a skill. A running
// Claude Code gets the slash command; a fresh one, another agent and the API tutor get the same request in words
// (an opening message that begins with "/" is left in Claude Code's input box instead of being sent).

import { tutor } from './tutor.svelte.ts';
import { feed } from './feed.svelte.ts';
import { link, router } from './router.svelte.ts';
import type { Roadmap } from '../../../shared/types.ts';

/** How long an agent's /clear is given before the sitting's command is typed in after it. */
const CLEAR_MS = 1500;
/** Set while a left sitting is being picked up again (pickUp): it starts clean, though his answer just touched it. */
let pickingUp = false;

export const actions = {
  /**
   * Sends his answer to a quiz or an ask; an error message, or null. When no tool call was waiting for it (the
   * session ended, or the wait ran out), Claude is told to collect it and carry on, once nothing else is open.
   */
  async answer(body: unknown): Promise<string | null> {
    // Whether the sitting was going on before this answer: the answer itself is activity, so read it first.
    const going = feed.inProgress;
    const result = await feed.answer(body);
    if ('error' in result) return result.error;
    if (!result.heard && !feed.items.some((i) => (i.type === 'quiz' || i.type === 'ask') && !i.answeredAt)) pickUp(going);
    return null;
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
      slug,
      'train',
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
  /** A review: of everything fading, of one class's (`topic`), or of one concept (`topic/concept`). */
  review(ref?: string) {
    const [slug = '', id] = ref?.split('/') ?? [];
    const topic = feed.topics[slug];
    const label = id
      ? `Reviewing ${topic?.concepts.find((c) => c.id === id)?.label ?? id}`
      : slug
        ? `Reviewing ${topic?.title ?? slug}`
        : 'A review of what is fading';
    const what = id ? `the concept ${ref}` : slug ? `what's fading in the topic ${slug}` : "what's fading";
    go(ref ? `/review ${ref}` : '/review', `Use the review skill to review ${what}.`, label, false, undefined, 'review');
  },
};

/**
 * Claude picks up answers it wasn't waiting for: told to collect them if its sitting is still going on here, or
 * asked to continue it (which collects them first) when the sitting has ended or was left a while ago, or Claude Code
 * isn't running: then its context has moved on, and the skill starts the sitting again from what is saved.
 */
function pickUp(going: boolean) {
  const session = feed.session;
  if (!session) return;
  if (going && tutor.running) {
    tutor.say("I've answered. Please collect my answers with collect_answers and carry on.");
    return;
  }
  const said = 'I answered the questions left open last time.';
  pickingUp = true;
  try {
    if (session.kind === 'review') actions.review();
    else if (session.kind === 'train') actions.train(session.topicSlug);
    else actions.continueTopic(session.topicSlug, said);
  } finally {
    pickingUp = false;
  }
}

/**
 * A lesson waits on its class and moves to the step being taught when it starts; a review opens on Review, a training
 * set on its own page. Planning a roadmap or a mission is a conversation: it stays on the page (where the draft
 * appears) and opens Claude beside it.
 */
function go(
  command: string,
  initial: string,
  label: string,
  converse = false,
  topic?: string,
  kind: 'learn' | 'review' | 'train' = 'learn',
) {
  // A new sitting starts from a clean context: the tutor in the drawer lives as long as the app, and would otherwise
  // carry every earlier sitting into each call. Only when no sitting is in progress (none open, or the open one idle
  // for a while: one nobody closed stays open on disk for days) and the tutor is idle (not working, not asking
  // something); conversations (a course, a mission) keep theirs.
  const fresh = !converse && tutor.running && !tutor.busy && !tutor.asking && (pickingUp || !feed.inProgress);
  if (fresh) {
    tutor.clear();
    // An agent gets the request after its /clear has run, not typed into the same input box.
    setTimeout(() => tutor.run(command, initial), tutor.mode === 'terminal' ? CLEAR_MS : 0);
  } else tutor.run(command, initial);
  if (converse) {
    tutor.toggle(true);
    return;
  }
  feed.begin(label);
  // A lesson happens in its class: wait on the class (or Home, for a topic not known yet), and go to the step being
  // taught once it starts. A review and a training set have their own pages.
  feed.follow = kind === 'learn' ? (topic ?? '*') : null;
  if (kind === 'review') {
    location.hash = link.review();
    return;
  }
  if (kind === 'train' && topic) {
    location.hash = link.train(topic);
    return;
  }
  const route = router.route;
  if (topic && (route.page === 'lesson' || route.page === 'step') && route.slug === topic) return;
  location.hash = topic ? link.lesson(topic) : link.now();
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
