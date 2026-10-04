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

// After a rebuild, an open tab may ask for page chunks that no longer exist. Reload once to get the new build.
addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  try {
    if (sessionStorage.getItem('mind-gym.reloaded') === '1') return;
    sessionStorage.setItem('mind-gym.reloaded', '1');
  } catch {
    // Reload anyway.
  }
  location.reload();
});
setTimeout(() => {
  try {
    sessionStorage.removeItem('mind-gym.reloaded');
  } catch {
    // Not essential.
  }
}, 10_000);
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
