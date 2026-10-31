// What the learner should know is wrong with their data: a backup that keeps failing, a file set aside as unreadable.
// The core's Warnings (@organon/core/server/warnings), one for the whole server; the interface shows the list (the
// `warnings` feed event, and FeedState.warnings).

import { Warnings } from '@organon/core/server/warnings';

export { Warnings };
export const warnings = new Warnings();
