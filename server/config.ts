import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const DATA_DIR = process.env.GYM_DATA_DIR ?? path.join(ROOT, 'data');
export const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
export const UI_DIR = path.join(ROOT, 'dist', 'ui');

export const HOST = '127.0.0.1';
export const PORT = Number(process.env.GYM_PORT ?? 4747);
/** Ports allowed in Host/Origin headers: the server itself and the Vite dev server. */
export const ALLOWED_PORTS = [PORT, 5173];

/** How long quiz and ask wait for an answer before handing control back to Claude. */
export const WAIT_MS = Number(process.env.GYM_WAIT_MS ?? 15 * 60_000);
/** Interval of progress notifications while a tool waits, so the call doesn't look idle. */
export const KEEPALIVE_MS = 15_000;
