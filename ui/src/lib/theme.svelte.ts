// Look settings: light or dark, and one accent. Remembered in this browser only.

export type Mode = 'dark' | 'light';
export type Accent = 'red' | 'violet' | 'blue' | 'graphite';
export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: 'red', label: 'Red', swatch: '#e04c53' },
  { id: 'violet', label: 'Violet', swatch: '#8a6ff0' },
  { id: 'blue', label: 'Blue', swatch: '#4f8cef' },
  { id: 'graphite', label: 'Graphite', swatch: '#8a8a8a' },
];

const KEY = 'mind-gym.look';

function read(): { mode: Mode; accent: Accent } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { mode?: string; accent?: string };
    return {
      mode: v.mode === 'light' ? 'light' : 'dark',
      accent: ACCENTS.some((a) => a.id === v.accent) ? (v.accent as Accent) : 'red',
    };
  } catch {
    return { mode: 'dark', accent: 'red' };
  }
}

class Look {
  value = $state<Mode>(read().mode);
  accent = $state<Accent>(read().accent);

  constructor() {
    this.apply();
  }

  toggle() {
    this.set(this.value === 'dark' ? 'light' : 'dark', this.accent);
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

  get dark(): boolean {
    return this.value === 'dark';
  }

  private apply() {
    document.documentElement.dataset.theme = this.value;
    document.documentElement.dataset.accent = this.accent;
  }
}

export const theme = new Look();
