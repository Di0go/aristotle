// Sets the look (dark or light, and the accent) on <html> before the first paint, exactly as theme.svelte.ts will,
// so a dark page never flashes white while the app loads. A file of its own, loaded synchronously from index.html:
// the page's Content-Security-Policy allows no inline scripts.
(() => {
  const root = document.documentElement;
  const accents = ['red', 'violet', 'blue', 'graphite'];
  let look = {};
  try {
    look = JSON.parse(localStorage.getItem('aristotle.look') ?? localStorage.getItem('mind-gym.look') ?? '{}') ?? {};
  } catch {
    // No storage (private window, blocked site data): the defaults.
  }
  root.dataset.theme = look.mode === 'light' ? 'light' : 'dark';
  // The accent he chose, else the one the server wrote on <html> (this install's setting), else blue.
  if (accents.includes(look.accent)) root.dataset.accent = look.accent;
  else if (!accents.includes(root.dataset.accent)) root.dataset.accent = 'blue';
})();
