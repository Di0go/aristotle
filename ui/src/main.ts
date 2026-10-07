// The interface's entry point: fonts and stylesheets, then the app mounted on the page.

import 'katex/dist/katex.min.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import '@fontsource-variable/jetbrains-mono/wght-italic.css';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/inter/wght-italic.css';
import './styles/base.css';
import './styles/prose.css';
import './styles/shell.css';
import './styles/lesson.css';
import './styles/map.css';
import './styles/charts.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { maths } from './lib/maths.svelte.ts';

// After a rebuild, an open tab may ask for page chunks that no longer exist. Reload once to get the new build;
// the flag stops a reload loop if the chunk is still missing, and clears after ten seconds so a later rebuild can reload again.
addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  try {
    if (sessionStorage.getItem('aristotle.reloaded') === '1') return;
    sessionStorage.setItem('aristotle.reloaded', '1');
  } catch {
    // Reload anyway.
  }
  location.reload();
});
setTimeout(() => {
  try {
    sessionStorage.removeItem('aristotle.reloaded');
  } catch {
    // Not essential.
  }
}, 10_000);

mount(App, { target: document.getElementById('app')! });
// KaTeX is off the startup path: it loads once the first paint is done, usually before any maths is on screen.
maths.preload();
