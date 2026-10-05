// Versions data/ in its own Git repository, kept apart from the code so his learning history never
// lands in the app's repo. Once activity has been quiet for a while (or a session ends), commit whatever
// changed; if that repository has a remote (one he set up, private), push it too.
// Off when data/ isn't a Git repository, in dev, or with ARISTOTLE_BACKUP=off. Setup: README, "Your data".

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { BACKUP, DATA_DIR } from './config.ts';

const run = promisify(execFile);
const git = (...args: string[]) => run('git', args, { cwd: DATA_DIR, timeout: 60_000 });

/** Quiet time after the last change before backing up. */
const QUIET_MS = 10 * 60_000;

export interface BackupStatus {
  enabled: boolean;
  lastAt?: string;
  lastError?: string;
  pending: boolean;
}

export class Backup {
  readonly enabled: boolean;
  private timer: NodeJS.Timeout | undefined;
  private running = false;
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

  state(): BackupStatus {
    return { ...this.status };
  }

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
    } catch (err) {
      const message = (err as { stderr?: string; message: string }).stderr?.trim() || (err as Error).message;
      console.error(`${new Date().toISOString()} Backup failed: ${message}`);
      this.status = { ...this.status, pending: false, lastError: message };
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
  const topics = new Set<string>();
  const roadmaps = new Set<string>();
  const missions = new Set<string>();
  let sessions = 0;
  for (const line of porcelain.split('\n')) {
    const file = line.slice(3).trim();
    const topic = /^topics\/([^/]+)\.json$/.exec(file);
    if (topic) topics.add(topic[1]);
    const roadmap = /^roadmaps\/([^/]+)\.json$/.exec(file);
    if (roadmap) roadmaps.add(roadmap[1]);
    const mission = /^missions\/([^/]+)\.json$/.exec(file);
    if (mission) missions.add(mission[1]);
    if (/^sessions\//.test(file)) sessions++;
  }
  const parts = [...topics];
  if (sessions) parts.push(`${sessions} session${sessions === 1 ? '' : 's'}`);
  for (const r of roadmaps) parts.push(`roadmap ${r}`);
  for (const m of missions) parts.push(`mission ${m}`);
  return parts.length ? parts.join(', ') : 'backup';
}
