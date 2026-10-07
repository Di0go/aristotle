// Claude Code inside Aristotle: one interactive `claude` running in a pseudo-terminal, streamed to the
// interface over a WebSocket. It is the same interactive Claude Code as in any terminal, on his own login.

import pty from 'node-pty';
import type { IPty } from 'node-pty';
import type { WebSocket } from 'ws';
import { CLAUDE_CMD as COMMAND, INSTANCE, ROOT } from './config.ts';
import { claudeEnv } from './oneshot.ts';

/** Output kept for clients that connect later, so the drawer shows the whole recent screen. */
const BUFFER_LIMIT = 256 * 1024;
/** A just-started Claude Code is taken to be ready for input once its output has been quiet this long… */
const READY_QUIET_MS = 1200;
/** …or after this long, whichever comes first. */
const READY_MAX_MS = 8000;

export type TerminalMessage =
  | { type: 'state'; running: boolean; command?: string }
  /** `replay`: the recent screen, sent once on connect; the client redraws from it. */
  | { type: 'output'; data: string; replay?: boolean }
  | { type: 'exit'; code: number };

/** What the drawer sends; anything malformed is ignored. */
type ClientMessage =
  /** `auto`: the interface opening, not a click; only the live app starts Claude Code that way. */
  | { type: 'start'; resume?: boolean; auto?: boolean }
  | { type: 'run'; text: string; initial?: string }
  | { type: 'stop' }
  | { type: 'input'; data: string }
  | { type: 'send'; text: string }
  | { type: 'resize'; cols: number; rows: number };

export class Terminal {
  private proc: IPty | null = null;
  private buffer = '';
  private clients = new Set<WebSocket>();
  private cols = 100;
  private rows = 30;
  /** Whether the program turned on bracketed paste, so multi-line text can be sent as one paste. */
  private bracketedPaste = false;
  /** Messages sent before a just-started Claude Code is ready for input, typed in once it is. */
  private queue: string[] = [];
  private ready = false;
  private readyTimer: ReturnType<typeof setTimeout> | undefined;

  get running() {
    return this.proc !== null;
  }

  /** Starts Claude Code; `prompt` becomes its first message. */
  start(resume = false, prompt?: string) {
    if (this.proc) return;
    const [file, ...args] = COMMAND.split(' ');
    if (resume) args.push('--continue');
    if (prompt) args.push(prompt);
    this.buffer = '';
    this.bracketedPaste = false;
    this.ready = false;
    // Never wait more than this for it to settle, however much it prints.
    this.readyTimer = setTimeout(() => this.settle(), READY_MAX_MS);
    this.proc = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: this.cols,
      rows: this.rows,
      cwd: ROOT,
      env: {
        ...claudeEnv(),
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        // quiz and ask wait for the learner, often longer than the two minutes after which Claude Code would move a
        // tool call to the background (an extra turn, and an answer lost if the session ends): they stay in front.
        CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS: '0',
        // Tells the bridge it serves the tutor in the drawer, and the Stop hook that this is a lesson, not development.
        ARISTOTLE_DRAWER: '1',
      } as Record<string, string>,
    });
    this.proc.onData((data) => {
      if (data.includes('\x1b[?2004h')) this.bracketedPaste = true;
      if (data.includes('\x1b[?2004l')) this.bracketedPaste = false;
      this.buffer = (this.buffer + data).slice(-BUFFER_LIMIT);
      // Ready once it has drawn its screen and gone quiet for a moment.
      if (!this.ready) {
        clearTimeout(this.readyTimer);
        this.readyTimer = setTimeout(() => this.settle(), READY_QUIET_MS);
      }
      this.broadcast({ type: 'output', data });
    });
    this.proc.onExit(({ exitCode }) => {
      this.proc = null;
      this.queue = [];
      clearTimeout(this.readyTimer);
      this.broadcast({ type: 'exit', code: exitCode });
      this.broadcast({ type: 'state', running: false });
    });
    this.broadcast({ type: 'state', running: true, command: [file, ...args].join(' ') });
  }

  stop() {
    this.proc?.kill();
  }

  /**
   * A request from the interface. If Claude Code is running, `text` is typed in (slash commands work there, and
   * queue while it is busy). If not, Claude Code starts with `initial` as its first message: an opening message
   * that begins with "/" is only put in the input box, not sent, so `initial` says the same thing in words.
   */
  run(text: string, initial = text) {
    const clean = text.trim();
    if (!clean) return;
    if (this.proc) this.send(clean);
    else this.start(false, initial.trim() || clean);
  }

  /** Types a message into Claude Code and submits it, as if typed at the prompt; held until it is ready for input. */
  send(text: string) {
    if (!this.proc) return;
    const clean = text.replace(/\r\n?/g, '\n').trimEnd();
    if (!clean) return;
    if (!this.ready) {
      this.queue.push(clean);
      return;
    }
    const body = clean.includes('\n') && this.bracketedPaste ? `\x1b[200~${clean}\x1b[201~` : clean.replace(/\n/g, ' ');
    this.proc.write(body);
    // Submit separately, so the Enter isn't swallowed as part of a paste.
    setTimeout(() => this.proc?.write('\r'), 120);
  }

  /** Claude Code is ready for input: type in what was sent meanwhile, one message at a time. */
  private settle() {
    if (this.ready || !this.proc) return;
    clearTimeout(this.readyTimer);
    this.ready = true;
    const queued = this.queue;
    this.queue = [];
    for (const [i, text] of queued.entries()) setTimeout(() => this.send(text), i * 400);
  }

  /** Connects a drawer: it gets the state and the recent screen, then its messages drive the terminal. */
  attach(ws: WebSocket) {
    this.clients.add(ws);
    sendTo(ws, { type: 'state', running: this.running });
    sendTo(ws, { type: 'output', data: this.buffer, replay: true });
    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        return;
      }
      // A Claude Code started by the dev instance would still teach through the live app's MCP server (.mcp.json),
      // so the dev instance never starts one on its own.
      if (msg.type === 'start' && !(msg.auto && INSTANCE === 'dev')) this.start(Boolean(msg.resume));
      else if (msg.type === 'stop') this.stop();
      else if (msg.type === 'input' && typeof msg.data === 'string') this.proc?.write(msg.data);
      else if (msg.type === 'send' && typeof msg.text === 'string') this.send(msg.text);
      else if (msg.type === 'run' && typeof msg.text === 'string') {
        this.run(msg.text, typeof msg.initial === 'string' ? msg.initial : undefined);
      } else if (msg.type === 'resize') this.resize(msg.cols, msg.rows);
    });
    ws.on('close', () => this.clients.delete(ws));
    // A malformed frame (invalid UTF-8, too large) closes this socket; unhandled, it would take the server down.
    ws.on('error', () => ws.terminate());
  }

  /** Ignores sizes no real drawer has. */
  private resize(cols: number, rows: number) {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 10 || rows < 4 || cols > 500 || rows > 200) return;
    this.cols = cols;
    this.rows = rows;
    this.proc?.resize(cols, rows);
  }

  private broadcast(msg: TerminalMessage) {
    for (const ws of this.clients) sendTo(ws, msg);
  }
}

function sendTo(ws: WebSocket, msg: TerminalMessage) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
