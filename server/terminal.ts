// An agent CLI inside Aristotle: one interactive Claude Code (or Codex, Gemini CLI, opencode: agents.ts) running in a
// pseudo-terminal, its screen streamed to the drawer (tutor.ts). It is the same agent as in any terminal, on the
// learner's own login.

import pty from 'node-pty';
import type { IPty } from 'node-pty';
import { ROOT, TERMINAL_QUIET_MS } from './config.ts';
import type { AgentLaunch } from './agents.ts';
import { claudeEnv } from './oneshot.ts';
import { onPath } from './settings.ts';
import { AGENTS, type TutorMessage } from '../shared/tutor.ts';

/** Output kept for clients that connect later, so the drawer shows the whole recent screen. */
const BUFFER_LIMIT = 256 * 1024;
/** A just-started agent is taken to be ready for input once its output has been quiet this long… */
const READY_QUIET_MS = TERMINAL_QUIET_MS;
/** …or after this long, whichever comes first. */
const READY_MAX_MS = 8000;

type Emit = (msg: TutorMessage) => void;

export class Terminal {
  private proc: IPty | null = null;
  private buffer = '';
  private cols = 100;
  private rows = 30;
  /** Whether the program turned on bracketed paste, so multi-line text can be sent as one paste. */
  private bracketedPaste = false;
  /** Messages sent before a just-started agent is ready for input, typed in once it is. */
  private queue: string[] = [];
  private ready = false;
  private readyTimer: ReturnType<typeof setTimeout> | undefined;
  private command = '';
  readonly agent: AgentLaunch;
  private readonly emit: Emit;

  constructor(agent: AgentLaunch, emit: Emit) {
    this.agent = agent;
    this.emit = emit;
  }

  get running() {
    return this.proc !== null;
  }

  /** What a drawer is sent on connecting: the state and the recent screen. */
  replay(): TutorMessage[] {
    return [this.state(), { type: 'output', data: this.buffer, replay: true }];
  }

  state(): TutorMessage {
    const installed = onPath(this.agent.file);
    const full = AGENTS.find((a) => a.id === this.agent.id)?.name ?? this.agent.name;
    return {
      type: 'state',
      running: this.running,
      mode: 'terminal',
      engine: this.agent.id,
      name: this.agent.name,
      ...(this.command ? { command: this.command } : {}),
      ...(installed ? {} : { problem: `${full} is not installed (no "${this.agent.file}" on the PATH).` }),
    };
  }

  /** Starts the agent; `prompt` becomes its first message. */
  start(resume = false, prompt?: string) {
    if (this.proc) return;
    const args = this.agent.args({ resume, prompt });
    this.buffer = '';
    this.bracketedPaste = false;
    this.ready = false;
    // Never wait more than this for it to settle, however much it prints.
    this.readyTimer = setTimeout(() => this.settle(), READY_MAX_MS);
    try {
      this.proc = pty.spawn(this.agent.file, args, {
        name: 'xterm-256color',
        cols: this.cols,
        rows: this.rows,
        cwd: ROOT,
        env: {
          ...claudeEnv(),
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          ...this.agent.env,
          // Tells the bridge it serves the tutor in the drawer, and the Stop hook that this is a lesson, not development.
          ARISTOTLE_DRAWER: '1',
        } as Record<string, string>,
      });
    } catch (err) {
      clearTimeout(this.readyTimer);
      this.emit({ type: 'output', data: `\r\nCould not start ${this.agent.name}: ${(err as Error).message}\r\n` });
      this.emit(this.state());
      return;
    }
    this.command = [this.agent.file, ...args].join(' ');
    this.proc.onData((data) => {
      if (data.includes('\x1b[?2004h')) this.bracketedPaste = true;
      if (data.includes('\x1b[?2004l')) this.bracketedPaste = false;
      this.buffer = (this.buffer + data).slice(-BUFFER_LIMIT);
      // Ready once it has drawn its screen and gone quiet for a moment.
      if (!this.ready) {
        clearTimeout(this.readyTimer);
        this.readyTimer = setTimeout(() => this.settle(), READY_QUIET_MS);
      }
      this.emit({ type: 'output', data });
    });
    const proc = this.proc;
    proc.onExit(({ exitCode }) => {
      if (this.proc !== proc) return;
      this.proc = null;
      this.queue = [];
      clearTimeout(this.readyTimer);
      this.emit({ type: 'exit', code: exitCode });
      this.emit(this.state());
    });
    this.emit(this.state());
  }

  stop() {
    this.proc?.kill();
  }

  /** The engine is being replaced (Settings changed). */
  dispose() {
    this.stop();
  }

  /**
   * A request from the interface. If the agent is running, `text` is typed in: the slash command for an agent that has
   * the skills (they queue while it is busy), the same in words for the others. If not, it starts with `initial` as its
   * first message: an opening message that begins with "/" is only put in the input box, not sent.
   */
  run(text: string, initial = text) {
    const clean = (this.agent.slash ? text : initial || text).trim();
    if (!clean) return;
    if (this.proc) this.send(clean);
    else this.start(false, initial.trim() || clean);
  }

  /** A new conversation, for a new sitting, if the agent has a command for it. */
  clear() {
    if (this.proc && this.agent.clear) this.send(this.agent.clear);
  }

  /** Raw keystrokes from the drawer. */
  input(data: string) {
    this.proc?.write(data);
  }

  /** Types a message in and submits it, as if typed at the prompt; held until the agent is ready for input. */
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

  /** Ignores sizes no real drawer has. */
  resize(cols: number, rows: number) {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 10 || rows < 4 || cols > 500 || rows > 200) return;
    this.cols = cols;
    this.rows = rows;
    this.proc?.resize(cols, rows);
  }

  /** The agent is ready for input: type in what was sent meanwhile, one message at a time. */
  private settle() {
    if (this.ready || !this.proc) return;
    clearTimeout(this.readyTimer);
    this.ready = true;
    const queued = this.queue;
    this.queue = [];
    for (const [i, text] of queued.entries()) setTimeout(() => this.send(text), i * 400);
  }
}
