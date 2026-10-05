// Focus mode: everything but the page hides (ribbon, library, tabs, status line, the bench beside a lesson), for
// reading and answering with nothing else in view. F toggles it, Escape leaves it; remembered per browser.

import { searchBox } from './search.svelte.ts';
import { asides } from './aside.svelte.ts';
import { glossing } from './gloss.svelte.ts';

const KEY = 'aristotle.focus';

class Focus {
  on = $state(read());

  constructor() {
    $effect.root(() => {
      $effect(() => {
        document.documentElement.classList.toggle('focus', this.on);
        try {
          localStorage.setItem(KEY, this.on ? '1' : '0');
        } catch {
          // Not essential.
        }
      });
    });
    // Capture phase, so Escape is seen before a panel or card closes on it: it leaves focus only when nothing
    // else was open to close.
    addEventListener(
      'keydown',
      (e) => {
        const typing = (e.target as Element | null)?.closest?.('input, textarea, select, [contenteditable], .xterm');
        if (e.key === 'Escape' && this.on && !asides.open && !glossing.pinned && !searchBox.open) this.on = false;
        else if ((e.key === 'f' || e.key === 'F') && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) this.toggle();
      },
      { capture: true },
    );
  }

  toggle(value = !this.on) {
    this.on = value;
  }
}

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export const focus = new Focus();
