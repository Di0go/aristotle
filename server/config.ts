// Every setting the server reads, in one place. Each comes from an ARISTOTLE_* environment variable with a
// default; docs/development.md lists them all (a test keeps that list honest).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');

/**
 * Which instance this is. `live` is the one you learn in (port 4747, data/, https://aristotle.test).
 * `dev` is the one you change (scripts/dev.ts): its own port, its own data in .dev/, no TLS, no backup and no
 * systemd, so nothing done there can touch the live app or your learning history.
 */
export const INSTANCE: 'live' | 'dev' = process.env.ARISTOTLE_INSTANCE === 'dev' ? 'dev' : 'live';
const DEV = INSTANCE === 'dev';

/** Where this instance keeps its learning history: plain files, its own Git repository (server/backup.ts). */
export const DATA_DIR = process.env.ARISTOTLE_DATA_DIR ?? path.join(ROOT, DEV ? '.dev/data' : 'data');
export const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
export const TOPICS_DIR = path.join(DATA_DIR, 'topics');
export const ROADMAPS_DIR = path.join(DATA_DIR, 'roadmaps');
export const MISSIONS_DIR = path.join(DATA_DIR, 'missions');
/** Where this install keeps what isn't learning: certificate, settings, pid files, log. Never in git. */
export const STATE_DIR = process.env.ARISTOTLE_STATE_DIR ?? path.join(ROOT, DEV ? '.dev/state' : '.aristotle');
export const UI_DIR = path.join(ROOT, 'dist', 'ui');

export const HOST = '127.0.0.1';
/** The HTTP port: 4747 live, 4757 dev. */
export const PORT = Number(process.env.ARISTOTLE_PORT ?? (DEV ? 4757 : 4747));
/** The clean name: /etc/hosts maps it to 127.0.0.82, and nftables forwards its ports 80 and 443 here (scripts/setup-hostname.sh). */
export const HOSTNAME = process.env.ARISTOTLE_HOSTNAME ?? 'aristotle.test';

/** HTTPS for the clean name: a certificate from scripts/tls.sh, served on its own port that 443 is forwarded to. Off in dev. */
export const TLS_DIR = process.env.ARISTOTLE_TLS_DIR ?? path.join(STATE_DIR, 'tls');
/** The HTTPS port, which the clean name's port 443 is forwarded to. */
export const TLS_PORT = Number(process.env.ARISTOTLE_TLS_PORT ?? 4748);
export const TLS_ENABLED = !DEV && existsSync(path.join(TLS_DIR, 'server.crt'));
/** Written by scripts/setup-hostname.sh once the browsers trust the certificate: only then does http:// move to https://. */
export const TLS_TRUSTED = TLS_ENABLED && existsSync(path.join(TLS_DIR, 'installed'));
/** The address to give the learner: the clean name when it is set up, else plain localhost. */
export const URL_CLEAN = DEV ? `http://localhost:${PORT}` : `${TLS_TRUSTED ? 'https' : 'http'}://${HOSTNAME}`;

/** This install's own choices, kept out of git: settings.json in the state directory (for example {"accent": "red"}). */
const SETTINGS_FILE = process.env.ARISTOTLE_SETTINGS ?? path.join(STATE_DIR, 'settings.json');
function readSettings(): { accent?: string } {
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, 'utf8')) as { accent?: string };
  } catch {
    return {};
  }
}
/** The accent the interface starts with until a browser picks its own (blue when unset). */
export const ACCENT = ['blue', 'red', 'violet', 'graphite'].includes(readSettings().accent ?? '') ? readSettings().accent : undefined;

/** The Vite dev server's port (vite.config.ts), which proxies to this server in dev. */
export const VITE_PORT = Number(process.env.ARISTOTLE_VITE_PORT ?? 5173);
/** Names and ports allowed in Host/Origin headers: this server, the Vite dev server, and the forwarded name. */
export const ALLOWED_NAMES = ['localhost', '127.0.0.1', HOSTNAME];
export const ALLOWED_PORTS = [PORT, VITE_PORT, 80, 443];

/** Commit data/ after quiet periods (server/backup.ts). Off in dev: its data is disposable. */
export const BACKUP = !DEV && process.env.ARISTOTLE_BACKUP !== 'off';
/** The command the terminal drawer runs (server/terminal.ts); tests swap in a shell. */
export const CLAUDE_CMD = process.env.ARISTOTLE_CLAUDE_CMD ?? 'claude';

/** How long quiz and ask wait for an answer before handing control back to Claude. */
export const WAIT_MS = Number(process.env.ARISTOTLE_WAIT_MS ?? 15 * 60_000);
/** Interval of progress notifications while a tool waits, so the call doesn't look idle. */
export const KEEPALIVE_MS = 15_000;
