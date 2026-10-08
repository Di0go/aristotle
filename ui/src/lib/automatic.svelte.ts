// What Aristotle does on its own, from what he does, so he never presses a button for the app's housekeeping.
// For now: a course whose classes are all done gets its final mission designed. The tutor normally does this as it
// closes the last class (the teach skill); this catches the case where it didn't, once per course.

import { tutor } from './tutor.svelte.ts';
import { feed } from './feed.svelte.ts';
import { stepsOf } from './library.ts';

const ASKED = 'aristotle.final-asked.';

$effect.root(() => {
  $effect(() => {
    if (!feed.loaded || feed.missions === null || !tutor.running || tutor.busy || tutor.asking) return;
    if (feed.session && !feed.session.endedAt) return;
    for (const r of feed.roadmapList) {
      if (r.status !== 'active') continue;
      const steps = stepsOf(r, feed.topics);
      if (!steps.length || steps.some((s) => s.state !== 'done')) continue;
      if (feed.missionList.some((m) => m.scope === 'capstone' && m.roadmap === r.slug)) continue;
      if (asked(r.slug)) continue;
      remember(r.slug);
      tutor.run(
        `/praxis capstone ${r.slug}. Every class is done: design and save the final mission on your own, without asking me first.`,
        `Use the praxis skill: every class of my course ${r.slug} is done. Design and save its final mission on your own, without asking me first.`,
      );
      return;
    }
  });
});

function asked(slug: string): boolean {
  try {
    return localStorage.getItem(ASKED + slug) === '1';
  } catch {
    return true;
  }
}

function remember(slug: string) {
  try {
    localStorage.setItem(ASKED + slug, '1');
  } catch {
    // Without storage, asked() says yes, so it never asks twice anyway.
  }
}
