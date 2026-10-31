// Every setting the server reads, in one place. What every app of the saga has (the instance, its ports, folders,
// names, TLS, the exact Hosts and Origins) is the core's defineApp over app.json (@organon/core/server/app), each
// from an ARISTOTLE_* variable with a default; what is Aristotle's own is below it, from ARISTOTLE_* too.
// docs/development.md lists them all (a test keeps that list honest).

import os from 'node:os';
import path from 'node:path';
import { defineApp } from '@organon/core/server/app';

/** The checkout this server runs from. */
export const ROOT = path.resolve(import.meta.dirname, '..');

/**
 * This instance of Aristotle (app.json, through the core). `live` is the one you learn in (port 4747, data/,
 * https://aristotle.test). `dev` is the one you change (scripts/dev.ts): its own port, its own data in .dev/, no TLS,
 * no backup and no systemd, so nothing done there can touch the live app or your learning history.
 */
export const app = defineApp(ROOT);
export const INSTANCE = app.instance;

/** Where this instance keeps its learning history: plain files, its own Git repository (server/backup.ts). */
export const DATA_DIR = app.dataDir;
export const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
export const TOPICS_DIR = path.join(DATA_DIR, 'topics');
export const ROADMAPS_DIR = path.join(DATA_DIR, 'roadmaps');
export const MISSIONS_DIR = path.join(DATA_DIR, 'missions');
export const GLOSSES_FILE = path.join(DATA_DIR, 'glosses.json');
export const ASIDES_FILE = path.join(DATA_DIR, 'asides.json');
export const NOTES_FILE = path.join(DATA_DIR, 'notes.json');
export const ABOUT_FILE = path.join(DATA_DIR, 'about.md');
export const PROFILE_FILE = path.join(DATA_DIR, 'profile.md');
export const CHATS_DIR = path.join(DATA_DIR, 'chats');

/** Where this install keeps what isn't learning: certificate, settings, pid files, log. Never in git. */
export const STATE_DIR = app.stateDir;
export const UI_DIR = app.uiDir;
/** The only addresses the server listens on (127.0.0.1, and ::1 held so no other user answers "localhost"). */
export const HOST = app.host;
export const HOST6 = app.host6;
/** The HTTP port: 4747 live, 4757 dev. */
export const PORT = app.port;
/** The clean name (the address it shows and tls.sh's certificate). */
export const HOSTNAME = app.hostname;
/** HTTPS for the clean name: a certificate from tls.sh, served on its own port that 443 is forwarded to. Off in dev. */
export const TLS_DIR = app.tlsDir;
export const TLS_PORT = app.tlsPort;
export const TLS_ENABLED = app.tlsEnabled;
export const TLS_TRUSTED = app.tlsTrusted;
/** The address to give the learner: the clean name when it is set up, else plain localhost. */
export const URL_CLEAN = app.url;
/** This install's own choices, kept out of git: settings.json in the state folder (server/settings.ts), the accent among them. */
export const SETTINGS_FILE = app.settingsFile;
/** The Vite dev server's port (vite.config.ts), which proxies to this server in dev. */
export const VITE_PORT = app.vitePort;
/** Whether the clean name leads here: /etc/hosts maps it (setup-hostname.sh), or there is a certificate. Never in dev. */
export const HOSTNAME_READY = app.hostnameReady;
/** The exact Host headers this server answers (DNS rebinding: a page on another name gets nothing). */
export const ALLOWED_HOSTS = app.allowedHosts;
/** The exact origins of Aristotle's own pages; every other page is refused (CSRF, and above all the terminal). */
export const ALLOWED_ORIGINS = app.allowedOrigins;

/** Commit data/ after quiet periods (server/backup.ts). Off in dev: its data is disposable. */
export const BACKUP = !app.dev && app.env('BACKUP') !== 'off';
/** How long a just-started Claude Code must be quiet before messages are typed into it (terminal.ts); short in tests. */
export const TERMINAL_QUIET_MS = Number(app.env('TERMINAL_QUIET_MS') ?? 1200);
/** The command the terminal drawer runs (the core's terminal, server/tutor.ts); tests swap in a shell. */
export const CLAUDE_CMD = app.env('CLAUDE_CMD') ?? 'claude';

/** The model for glosses and his questions on a passage (server/oneshot.ts): an alias Claude Code knows, on his own login. */
export const ONESHOT_MODEL = app.env('ONESHOT_MODEL') ?? 'sonnet';
/**
 * A key for the model API (server/settings.ts), for anyone who would rather not keep it in settings.json; a key saved
 * there comes first.
 */
export const API_KEY = app.apiKey;
/** Wikimedia Commons' API, which find_images and glosses search; tests point it at a local stand-in. */
export const COMMONS_API = app.env('COMMONS_API') ?? 'https://commons.wikimedia.org/w/api.php';
/** Whether a gloss may carry a picture from Wikimedia Commons, when one would help (off in the tests: no network). */
export const GLOSS_IMAGES = app.env('GLOSS_IMAGES') !== 'off';
/** A command that reads a question on stdin and prints the answer, in place of Claude Code (oneshot.ts); tests swap one in. */
export const ONESHOT_CMD = app.env('ONESHOT_CMD');

/**
 * How long quiz and ask hold the tutor's call waiting for his answer, from when the question was asked. Then the call
 * returns and the tutor ends its turn with the sitting still open: a tutor held for long reads as stuck, while his
 * answer, whenever it comes, brings it back (actions.ts pickUp).
 */
export const WAIT_MS = Number(app.env('WAIT_MS') ?? 3 * 60_000);
/**
 * How long one piece of a wait lasts for a client that ends tool calls after a minute whatever they report (Cursor's
 * CLI, mcp.ts): the wait comes in pieces, each ending in "still waiting"; short in tests.
 */
export const WAIT_SLICE_MS = Number(app.env('WAIT_SLICE_MS') ?? 45_000);
/** Interval of progress notifications while a tool waits, so the call doesn't look idle. */
export const KEEPALIVE_MS = 15_000;

/**
 * The folder `claude -p` runs in for glosses, questions on a passage and the chat: private to this user (not /tmp, where
 * anyone could leave a CLAUDE.md) and outside any project, so no project's CLAUDE.md is read into it.
 */
export const CLAUDE_CWD =
  app.env('CLAUDE_CWD') ?? path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'aristotle', INSTANCE);
