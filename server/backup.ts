// Versions data/ in its own Git repository, kept apart from the code so his learning history never
// lands in the app's repo. Once activity has been quiet for a while (or a session ends), commit whatever
// changed; if that repository has a remote (one he set up, private), push it too.
// Off when data/ isn't a Git repository, in dev, or with ARISTOTLE_BACKUP=off. Setup: README, "Your data".

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { BACKUP, DATA_DIR } from './config.ts';
import { warnings } from './warnings.ts';

const run = promisify(execFile);
const git = (...args: string[]) => run('git', args, { cwd: DATA_DIR, timeout: 60_000 });

/** Quiet time after the last change before backing up. */
const QUIET_MS = 10 * 60_000;

export interface BackupStatus {
  enabled: boolean;
  lastAt?: string;
  lastError?: string;
  /** When the current run of failures began; gone after a run that works. */
  failingSince?: string;
  pending: boolean;
}

export class Backup {
  readonly enabled: boolean;
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  /** A run was asked for while one was going: run once more when it ends. */
  private again = false;
  private status: BackupStatus;

  constructor() {
    this.enabled = BACKUP && existsSync(path.join(DATA_DIR, '.git'));
    this.status = { enabled: this.enabled, pending: false };
  }

  /** Back up after `delay` ms of quiet; each call restarts the wait. */
  schedule(delay = QUIET_MS) {
    if (!this.enabled) return;
    clearTimeout(this.timer);
    this.status.pending = true;
    this.timer = setTimeout(() => void this.run(), delay);
    this.timer.unref();
  }

  /** A copy of the status, for /api/backup. */
  state(): BackupStatus {
    return { ...this.status };
  }

  /** Commits whatever changed and pushes it if there is a remote; never two runs at once. */
  private async run() {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      const { stdout } = await git('status', '--porcelain');
      if (stdout.trim()) {
        await git('add', '--all');
        await git('commit', '--quiet', '-m', `Data: ${describe(stdout)}`);
      }
      // Pushed only when he has given the data repository a remote to track.
      const upstream = await git('rev-parse', '--abbrev-ref', '@{u}').catch(() => null);
      if (upstream) {
        const ahead = Number((await git('rev-list', '--count', '@{u}..HEAD')).stdout.trim());
        if (ahead > 0) await git('push', '--quiet');
      }
      this.status = { enabled: true, pending: false, lastAt: new Date().toISOString() };
      warnings.set('backup', undefined);
    } catch (err) {
      const message = (err as { stderr?: string; message: string }).stderr?.trim() || (err as Error).message;
      console.error(`${new Date().toISOString()} Backup failed: ${message}`);
      const since = this.status.failingSince ?? new Date().toISOString();
      this.status = { ...this.status, pending: false, lastError: message, failingSince: since };
      // Said where the learner looks, not only in a log nobody reads: a backup that silently stops is worse than none.
      const when = new Date(since).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
      warnings.set('backup', `Backup has failed since ${when}: ${message.split('\n').at(-1)}`);
    } finally {
      this.running = false;
      if (this.again) {
        this.again = false;
        this.schedule(5_000);
      }
    }
  }
}

/** "differential-forms, 2 sessions, roadmap fighting-mind, mission x" from `git status --porcelain` output. */
function describe(porcelain: string): string {
  const named = { topics: new Set<string>(), roadmaps: new Set<string>(), missions: new Set<string>() };
  let sessions = 0;
  for (const line of porcelain.split('\n')) {
    // Each line is a two-letter status and a space, then the path.
    const file = line.slice(3).trim();
    const [, dir, name] = /^(topics|roadmaps|missions)\/([^/]+)\.json$/.exec(file) ?? [];
    if (dir) named[dir as keyof typeof named].add(name);
    if (/^sessions\//.test(file)) sessions++;
  }
  const parts = [...named.topics];
  if (sessions) parts.push(`${sessions} session${sessions === 1 ? '' : 's'}`);
  for (const r of named.roadmaps) parts.push(`roadmap ${r}`);
  for (const m of named.missions) parts.push(`mission ${m}`);
  return parts.length ? parts.join(', ') : 'backup';
}
