// The interface's entry point: the core's fonts and styles, Aristotle's own after each, then the app mounted on the page.

import 'katex/dist/katex.min.css';
import '@organon/core/ui/fonts.css';
import '@organon/core/ui/tokens.css';
import '@organon/core/ui/base.css';
import './styles/base.css';
import './styles/prose.css';
import '@organon/core/ui/shell.css';
import '@organon/core/ui/agent.css';
import './styles/shell.css';
import './styles/lesson.css';
import './styles/map.css';
import '@organon/core/ui/charts.css';
import './styles/charts.css';
import { setWords } from '@organon/core/ui/words';
import { mount } from 'svelte';
import App from './App.svelte';
// Drafts under Aristotle's keys before anything reads one (the core's Composer among them).
import './lib/drafts.ts';
import { maths } from './lib/maths.svelte.ts';

// The core's words in English, as Aristotle says them: the tutor, the lesson's record, a question waiting.
setWords('en', {
  drawerLabel: 'The tutor',
  drawerApi: (name) => `Tutor · ${name}`,
  newConversationHint: "Start a new conversation (the lesson's record stays)",
  settingsHint: 'Who teaches: Claude Code, another agent, or a model API',
  messageAgent: 'Message the tutor',
  stopAgentHint: 'Stop what it is doing; a question waiting for you stays open',
  settingsLede:
    'Who teaches. Whichever you choose works through the same tools and follows the same method, and your library stays exactly as it is.',
  settingsWho: 'The tutor',
  settingsAgent: 'tutor',
  settingsSwitch: (running) =>
    `Saving stops ${running}, running in the drawer now. A question waiting for you stays open for the next tutor.`,
  settingsHelper: 'For glosses and chat',
  settingsHelperHint: 'A smaller, quicker model is enough for glosses, questions on a passage and the chat.',
  settingsVision: 'The model can see images (it then checks its drawings and reads real images)',
  settingsChatTitle: 'Glosses, questions and the chat',
  settingsChatHint: 'What explains a phrase you select, answers a question on a passage, and talks with you beside a lesson.',
});

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
