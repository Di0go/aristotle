// Look settings: light or dark, and one accent. Remembered in this browser only.

import { faviconHref } from './Logo.svelte';
import { migrateKey } from './storage.ts';

export type Mode = 'dark' | 'light';
export type Accent = 'red' | 'violet' | 'blue' | 'graphite';

export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: 'blue', label: 'Blue', swatch: '#4f8cef' },
  { id: 'red', label: 'Red', swatch: '#e04c53' },
  { id: 'violet', label: 'Violet', swatch: '#8a6ff0' },
  { id: 'graphite', label: 'Graphite', swatch: '#8a8a8a' },
];

const KEY = 'aristotle.look';
/** The name it had before the app was renamed, moved over on first read. */
const OLD_KEY = 'mind-gym.look';

const isAccent = (v: unknown): v is Accent => ACCENTS.some((a) => a.id === v);

/** Blue, unless this install chose another in .aristotle/settings.json (the server writes it on <html>). */
const DEFAULT_ACCENT: Accent = isAccent(document.documentElement.dataset.accent) ? document.documentElement.dataset.accent : 'blue';

class Look {
  /** Dark or light. */
  value = $state<Mode>(read().mode);
  accent = $state<Accent>(read().accent);

  constructor() {
    this.apply();
  }

  get dark(): boolean {
    return this.value === 'dark';
  }

  set(mode: Mode, accent: Accent) {
    this.value = mode;
    this.accent = accent;
    try {
      localStorage.setItem(KEY, JSON.stringify({ mode, accent }));
    } catch {
      // Not essential.
    }
    this.apply();
  }

  private apply() {
    const root = document.documentElement;
    root.dataset.theme = this.value;
    root.dataset.accent = this.accent;
    // The tab icon follows the look too.
    const accent = getComputedStyle(root).getPropertyValue('--acc').trim() || '#2f6fde';
    document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute('href', faviconHref(this.dark, accent));
  }
}

export const theme = new Look();

function read(): { mode: Mode; accent: Accent } {
  try {
    migrateKey(OLD_KEY, KEY);
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { mode?: string; accent?: string };
    return {
      mode: v.mode === 'light' ? 'light' : 'dark',
      accent: isAccent(v.accent) ? v.accent : DEFAULT_ACCENT,
    };
  } catch {
    return { mode: 'dark', accent: DEFAULT_ACCENT };
  }
}
