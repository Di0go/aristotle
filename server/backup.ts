// Backs up data/ to GitHub: once learning activity has been quiet for a while (or a session ends),
// commit whatever changed under data/ and push. Only data/ is ever committed here.

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { DATA_DIR, ROOT } from './config.ts';

const run = promisify(execFile);
const git = (...args: string[]) => run('git', args, { cwd: ROOT, timeout: 60_000 });

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
    this.enabled =
      process.env.GYM_BACKUP !== 'off' &&
      path.resolve(DATA_DIR) === path.join(ROOT, 'data') &&
      existsSync(path.join(ROOT, '.git'));
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
      const { stdout } = await git('status', '--porcelain', '--', 'data');
      if (stdout.trim()) {
        await git('add', '--all', '--', 'data');
        await git('commit', '--quiet', '-m', `Data: ${describe(stdout)}`, '--', 'data');
      }
      const branch = (await git('rev-parse', '--abbrev-ref', 'HEAD')).stdout.trim();
      const upstream = await git('rev-parse', '--abbrev-ref', '@{u}').catch(() => null);
      if (branch === 'main' && upstream) {
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

/** "differential-forms, how-the-internet-works (2 sessions)" from `git status --porcelain` output. */
function describe(porcelain: string): string {
  const topics = new Set<string>();
  let sessions = 0;
  for (const line of porcelain.split('\n')) {
    const file = line.slice(3).trim();
    const topic = /data\/topics\/([^/]+)\.json$/.exec(file);
    if (topic) topics.add(topic[1]);
    if (/data\/sessions\//.test(file)) sessions++;
  }
  const parts = [...topics];
  if (sessions) parts.push(`${sessions} session${sessions === 1 ? '' : 's'}`);
  return parts.length ? parts.join(', ') : 'backup';
}
