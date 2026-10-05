// The panel beside a step: whether it is folded away (so the step gets the whole width), and which of its tabs is
// open, This step or Chat. Both remembered per browser.

const KEY = 'aristotle.bench-hidden';
const TAB = 'aristotle.bench-tab';

class Bench {
  hidden = $state(read());
  tab = $state<'step' | 'chat'>(readTab());

  show(tab: 'step' | 'chat') {
    this.tab = tab;
    try {
      localStorage.setItem(TAB, tab);
    } catch {
      // Not essential.
    }
  }

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

function readTab(): 'step' | 'chat' {
  try {
    return localStorage.getItem(TAB) === 'chat' ? 'chat' : 'step';
  } catch {
    return 'step';
  }
}
