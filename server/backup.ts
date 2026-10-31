// Versions data/ in its own Git repository, kept apart from the code so the learning history never lands in the app's
// repo: the core's backup (@organon/core/server/backup). Once activity has been quiet for a while (or a session
// ends), it commits whatever changed, as "Data: <what>", and pushes if that repository has a remote (a private one the
// learner set up). Off when data/ isn't a Git repository, in dev, or with ARISTOTLE_BACKUP=off. Setup: README,
// "Your data". What the commit is about is Aristotle's: the topics, sittings, roadmaps and missions that changed.

import { Backup as CoreBackup } from '@organon/core/server/backup';
import { app } from './config.ts';
import { warnings } from './warnings.ts';

export type { BackupStatus } from '@organon/core/server/backup';

/** data/'s backup, as the server keeps it. */
export class Backup extends CoreBackup {
  constructor() {
    super({ app, warnings, describeChanges });
  }
}

/** "differential-forms, 2 sessions, roadmap fighting-mind, mission x" from the paths that changed in data/. */
export function describeChanges(files: string[]): string {
  const named = { topics: new Set<string>(), roadmaps: new Set<string>(), missions: new Set<string>() };
  let sessions = 0;
  for (const file of files) {
    const [, dir, name] = /^(topics|roadmaps|missions)\/([^/]+)\.json$/.exec(file) ?? [];
    if (dir && name) named[dir as keyof typeof named].add(name);
    if (/^sessions\//.test(file)) sessions++;
  }
  const parts = [...named.topics];
  if (sessions) parts.push(`${sessions} session${sessions === 1 ? '' : 's'}`);
  for (const r of named.roadmaps) parts.push(`roadmap ${r}`);
  for (const m of named.missions) parts.push(`mission ${m}`);
  return parts.length ? parts.join(', ') : 'backup';
}
