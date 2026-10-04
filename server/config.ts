import { existsSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const DATA_DIR = process.env.GYM_DATA_DIR ?? path.join(ROOT, 'data');
export const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
export const TOPICS_DIR = path.join(DATA_DIR, 'topics');
export const ROADMAPS_DIR = path.join(DATA_DIR, 'roadmaps');
export const UI_DIR = path.join(ROOT, 'dist', 'ui');

export const HOST = '127.0.0.1';
export const PORT = Number(process.env.GYM_PORT ?? 4747);
/** The clean name: /etc/hosts maps it to 127.0.0.82, and nftables forwards its ports 80 and 443 here (scripts/setup-hostname.sh). */
export const HOSTNAME = process.env.GYM_HOSTNAME ?? 'gym.test';

/** HTTPS for the clean name: a certificate from scripts/tls.sh, served on its own port that 443 is forwarded to. */
export const TLS_DIR = process.env.GYM_TLS_DIR ?? path.join(ROOT, '.gym', 'tls');
export const TLS_PORT = Number(process.env.GYM_TLS_PORT ?? 4748);
/** Written by scripts/setup-hostname.sh once the browsers trust the certificate: only then does http:// move to https://. */
export const TLS_TRUSTED = existsSync(path.join(TLS_DIR, 'installed'));
export const URL_CLEAN = `${TLS_TRUSTED ? 'https' : 'http'}://${HOSTNAME}`;

/** Names and ports allowed in Host/Origin headers: this server, the Vite dev server, and the forwarded name. */
export const ALLOWED_NAMES = ['localhost', '127.0.0.1', HOSTNAME];
export const ALLOWED_PORTS = [PORT, 5173, 80, 443];

/** How long quiz and ask wait for an answer before handing control back to Claude. */
export const WAIT_MS = Number(process.env.GYM_WAIT_MS ?? 15 * 60_000);
/** Interval of progress notifications while a tool waits, so the call doesn't look idle. */
export const KEEPALIVE_MS = 15_000;
