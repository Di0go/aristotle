// The terminal drawer's tutor: the core's (@organon/core/server/tutor). It runs whoever teaches, as Settings say: an
// agent CLI in a pseudo-terminal (Claude Code unless another was chosen), or Aristotle's own tutor on a model API
// (tutor-api.ts); a change in Settings swaps it at once. Drawers connect over a WebSocket (/api/terminal), only from
// Aristotle's own pages, at most eight at a time; the pseudo-terminal's agent runs in this checkout with
// ARISTOTLE_DRAWER=1.

import { Tutor } from '@organon/core/server/tutor';
import { agents } from './agents.ts';
import { app } from './config.ts';
import type { Gym } from './gym.ts';
import { settings } from './settings.ts';
import { apiTutor } from './tutor-api.ts';

/** The drawer over this gym. */
export function createTutor(gym: Gym): Tutor {
  return new Tutor({ app, settings, agents, api: apiTutor(gym) });
}
