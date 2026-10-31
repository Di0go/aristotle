// Who teaches, as this install chose (Claude Code by default, another agent CLI in the terminal drawer, or
// Aristotle's own tutor on a model API), and what writes glosses and chat answers: the core's settings
// (@organon/core/server/settings), kept with the accent in settings.json in the state folder, readable by this user
// only, changed from the interface (GET/PUT /api/settings) and applied at once. The API key never leaves the server
// whole. Aristotle keeps no key of its own beside the core's.

import { createSettings } from '@organon/core/server/settings';
import { API_KEY, SETTINGS_FILE } from './config.ts';
import { warnings } from './warnings.ts';

export { onPath, SettingsError } from '@organon/core/server/settings';

export const settings = createSettings({ file: SETTINGS_FILE, warnings, apiKey: API_KEY });
