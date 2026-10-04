// Starting things from the interface: each action asks the Claude Code running in the gym to run a skill.
// A running Claude gets the slash command; a fresh one starts with the same request in words, because an
// opening message that begins with "/" is left in the input box instead of being sent.

import { claude } from './claude.svelte.ts';
import { link } from './router.svelte.ts';

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

function go(command: string, initial: string) {
  claude.run(command, initial);
  if (location.hash !== link.now() && location.hash !== '') location.hash = link.now();
}

export const actions = {
  learn(topic: string, goal = '') {
    const what = oneLine(topic);
    const want = oneLine(goal) ? `. What I want from it: ${oneLine(goal)}` : '';
    go(`/teach ${what}${want}`, `Use the teach skill to teach me: ${what}${want}`);
  },
  continueTopic(slug: string) {
    go(`/teach continue ${slug}`, `Use the teach skill to continue the topic ${slug} where I left off.`);
  },
  train(slug: string) {
    go(`/train ${slug}`, `Use the train skill: a training set on the topic ${slug}.`);
  },
  review(slug?: string) {
    go(
      slug ? `/review ${slug}` : '/review',
      slug ? `Use the review skill to review what's fading in the topic ${slug}.` : "Use the review skill to review what's fading.",
    );
  },
};
