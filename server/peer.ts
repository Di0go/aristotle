// Which local user is at the other end of a loopback connection, read from the kernel's socket tables
// (/proc/net/tcp and tcp6, Linux). The server refuses connections from other users, so another account on the
// machine can't reach the terminal or the learning history, whatever headers it sends; and control.ts checks that
// whatever listens on Aristotle's port belongs to this user before taking it for Aristotle.
// Elsewhere (no /proc) these answer undefined and the Host and Origin checks stand alone.

import { readFileSync } from 'node:fs';

/** One row of /proc/net/tcp{,6}: an endpoint, its state, and the user that owns it. */
interface Row {
  address: string;
  port: number;
  state: string;
  uid: number;
}

/** The kernel's TCP state codes for a connected and a listening socket. */
const ESTABLISHED = '01';
const LISTEN = '0A';

/**
 * The user that owns the connected socket at `address:port` on this machine, if the kernel lists it. Only connected
 * sockets count: a closed connection that used the same port lingers (TIME_WAIT) and belongs to no one (uid 0).
 */
export function socketOwner(address: string | undefined, port: number | undefined): number | undefined {
  if (!address || !port) return undefined;
  const want = normalize(address);
  return rows().find((r) => r.port === port && r.state === ESTABLISHED && r.address === want)?.uid;
}

/** The user listening on `port` on 127.0.0.1, if anyone is. */
export function listenerOwner(port: number): number | undefined {
  return rows().find((r) => r.port === port && r.state === LISTEN && r.address === '127.0.0.1')?.uid;
}

function rows(): Row[] {
  const out: Row[] = [];
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n').slice(1)) {
      // sl local_address rem_address st tx_queue:rx_queue tr:tm->when retrnsmt uid ...
      const f = line.trim().split(/\s+/);
      if (f.length < 8) continue;
      const [hex, portHex] = f[1].split(':');
      out.push({ address: decode(hex), port: Number.parseInt(portHex, 16), state: f[3], uid: Number(f[7]) });
    }
  }
  return out;
}

/** An address as the kernel writes it (little-endian 32-bit words, in hex) to dotted IPv4 or full IPv6. */
function decode(hex: string): string {
  const words = hex.match(/.{8}/g) ?? [];
  const bytes = words.flatMap((w) => [6, 4, 2, 0].map((i) => Number.parseInt(w.slice(i, i + 2), 16)));
  if (bytes.length === 4) return bytes.join('.');
  // IPv4 mapped into IPv6 (::ffff:a.b.c.d) is the same endpoint as a.b.c.d.
  if (bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 255 && bytes[11] === 255) return bytes.slice(12).join('.');
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  return groups.join(':');
}

/** Node's form of an address in the same shape decode() gives. */
function normalize(address: string): string {
  const v4 = address.replace(/^::ffff:/, '');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return v4;
  // Expand "::" so it compares with the kernel's full form.
  const [head, tail = ''] = address.split('::');
  const a = head ? head.split(':') : [];
  const b = tail ? tail.split(':') : [];
  const full = address.includes('::') ? [...a, ...Array(8 - a.length - b.length).fill('0'), ...b] : a;
  return full.map((g) => Number.parseInt(g || '0', 16).toString(16)).join(':');
}
