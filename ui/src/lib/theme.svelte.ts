// Look settings: light or dark, and one accent, remembered in this browser only: the core's look
// (@organon/core/ui/theme) under Aristotle's key, blue unless this install chose another in .aristotle/settings.json
// (the server writes it on <html>), and the tab icon drawn from Aristotle's logo. The look kept under the Mind Gym's
// old key is moved over on first read (legacyKeys). theme-boot.js is told the same key, default and old key in
// index.html.

import { ACCENTS, type Accent, createTheme, type Mode } from '@organon/core/ui/theme';
import { faviconHref } from './Logo.svelte';

export { ACCENTS, type Accent, type Mode };
export const theme = createTheme({
  key: 'aristotle.look',
  defaultAccent: 'blue',
  legacyKeys: ['mind-gym.look'],
  // Before the styles have loaded there is no --acc yet: Aristotle's blue.
  favicon: (dark, accent) => faviconHref(dark, accent || '#2f6fde'),
});
