// What the learner should know is wrong with their data: a backup that keeps failing, a file set aside as unreadable.
// Kept by key, so each problem is said once and goes away when it is fixed; the interface shows the list (the
// `warnings` feed event, and FeedState.warnings).

import { EventEmitter } from 'node:events';

export class Warnings {
  private messages = new Map<string, string>();
  readonly events = new EventEmitter<{ change: [string[]] }>();

  /** Says `message` under `key`, or clears it when `message` is undefined. */
  set(key: string, message: string | undefined) {
    if (this.messages.get(key) === message) return;
    if (message === undefined) this.messages.delete(key);
    else this.messages.set(key, message);
    this.events.emit('change', this.list());
  }

  list(): string[] {
    return [...this.messages.values()];
  }
}

export const warnings = new Warnings();
