// Claude Code's Stop hook (.claude/settings.json): the core's (@organon/core/server/stop-hook). Before Claude finishes
// a turn in which it changed code, the generated docs are rewritten, and if a changed zone's prose docs were not
// touched (scripts/doc-zones.ts), Claude is sent back to update them (or to say why nothing needs to change). Only
// files changed since this session started count, and never in Aristotle's drawer (a lesson, not development).

import path from 'node:path';
import { runStopHook } from '@organon/core/server/stop-hook';
import { ZONES } from './doc-zones.ts';
import { generate } from './docs.ts';

await runStopHook(path.resolve(import.meta.dirname, '..'), { zones: ZONES, generate: () => generate(true) });
process.exit(0);
