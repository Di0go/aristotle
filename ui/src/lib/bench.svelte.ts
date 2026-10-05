// Whether the panel beside a step is folded away, so the step gets the whole width. Remembered per browser.

const KEY = 'aristotle.bench-hidden';

class Bench {
  hidden = $state(read());

  toggle(value = !this.hidden) {
    this.hidden = value;
    try {
      localStorage.setItem(KEY, value ? '1' : '0');
    } catch {
      // Not essential.
    }
  }
}

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export const bench = new Bench();
