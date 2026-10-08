// The connection to the tutor running inside Aristotle (server/tutor.ts): an agent CLI in a terminal (Claude Code
// by default, or Codex, Gemini CLI, opencode), or Aristotle's own tutor on a model API, whose conversation the drawer
// shows instead. Opening Aristotle starts an agent, so it is there, idle, before the learner asks for anything.

import type { TutorEngine, TutorEntry, TutorMessage } from '../../../shared/tutor.ts';

type Listener = (data: string, replay: boolean) => void;

/** ANSI escape sequences, stripped out to read what is on screen. */
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
/**
 * An agent's status line while it works: Claude Code's "✻ Noodling… (12s · ↓ 130 tokens · thinking)" (it redraws only
 * the cells that change, so a chunk may hold just the word or just the counter), Codex's "esc to interrupt", Gemini
 * CLI's "esc to cancel".
 */
const WORKING = /\p{Lu}\p{Ll}{2,}…|↓ \d+ tokens|esc to (interrupt|cancel)/u;
/** Sending the agent something counts as work until its status line shows up (it takes a second or two to start). */
const STARTING_MS = 10_000;
/** The status line redraws several times a second (with pauses of 2 s while its word changes); quiet this long, the work is over. */
const SETTLED_MS = 4000;
/** The status word in that line, e.g. "Pondering…". */
const STATUS_WORD = /(\p{Lu}\p{Ll}{2,}…)/gu;
/** An agent asking something only the terminal can answer: a permission or a trust prompt. */
const ASKING = /Do you want to|Would you like to|Enter to confirm|Esc to cancel|Allow (once|always)|\(y\/n\)/;

class Tutor {
  connected = $state(false);
  /** An agent is running in the terminal, or the API tutor is set up and can answer. */
  running = $state(false);
  /** How the drawer shows it: a terminal, or the API tutor's conversation. */
  mode = $state<'terminal' | 'api'>('terminal');
  engine = $state<TutorEngine>('claude-code');
  /** What the interface calls it: "Claude", "Codex", "Aristotle" (the API tutor). */
  name = $state('Claude');
  /** The command it runs as, or the API tutor's model. */
  command = $state('');
  /** Why it can't run: not installed, or the API not set up. */
  problem = $state('');
  /** The drawer is showing. */
  open = $state(false);
  /** The drawer has been opened at least once (it stays mounted afterwards). */
  mounted = $state(false);
  /** An agent seems to be waiting on a prompt in the terminal. */
  asking = $state(false);
  /** It is working. For an agent, read off its status line, and cleared a moment after the status line stops. */
  busy = $state(false);
  /** When the current stretch of work began. */
  busySince = $state(0);
  /** Its own word for what it is doing ("Pondering…", "thinking", "show"). */
  doing = $state('');
  /** The last thing it said, best effort: what to answer when it is waiting on the learner. */
  lastSaid = $state('');
  /** The API tutor's conversation, as the drawer shows it. */
  entries = $state<TutorEntry[]>([]);

  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  /** Everything shown so far (the last 256 KB), replayed to a terminal that opens late. */
  private screen = '';
  /** The last stretch of output as plain text, watched for a prompt that needs the learner. */
  private recent = '';
  private retry: ReturnType<typeof setTimeout> | undefined;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  /** An agent is started once per page load, not again after it is stopped or exits. */
  private autoStarted = false;

  connect() {
    if (this.ws) return;
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/terminal`);
    this.ws = ws;
    ws.onopen = () => (this.connected = true);
    ws.onmessage = (e) => this.receive(JSON.parse(e.data) as TutorMessage);
    ws.onclose = () => {
      this.ws = null;
      this.connected = false;
      clearTimeout(this.retry);
      this.retry = setTimeout(() => this.connect(), 2000);
    };
  }

  private receive(msg: TutorMessage) {
    switch (msg.type) {
      case 'state':
        return this.state(msg);
      case 'output':
        return this.output(msg.data, Boolean(msg.replay));
      case 'transcript':
        this.entries = msg.entries;
        this.lastSaid = said(this.entries);
        return;
      case 'entry': {
        const at = this.entries.findIndex((e) => e.id === msg.entry.id);
        if (at === -1) this.entries.push(msg.entry);
        else this.entries[at] = msg.entry;
        if (this.entries.length > 400) this.entries.splice(0, this.entries.length - 400);
        this.lastSaid = said(this.entries);
        return;
      }
      case 'delta': {
        const e = this.entries.find((x) => x.id === msg.id);
        if (e) e.text += msg.text;
        return;
      }
      case 'activity':
        if (msg.busy && !this.busy) this.busySince = msg.since || Date.now();
        this.busy = msg.busy;
        this.doing = msg.doing;
        return;
    }
  }

  private state(msg: Extract<TutorMessage, { type: 'state' }>) {
    const switched = msg.mode !== this.mode || msg.engine !== this.engine;
    this.mode = msg.mode;
    this.engine = msg.engine;
    this.name = msg.name;
    this.command = msg.command ?? '';
    this.problem = msg.problem ?? '';
    this.running = Boolean(msg.running);
    if (switched) {
      // Another tutor took over: nothing of the last one's screen or work carries over.
      this.screen = '';
      this.entries = [];
      this.busy = false;
      this.doing = '';
      this.lastSaid = '';
      for (const l of this.listeners) l('', true);
    }
    if (!this.running) this.asking = false;
    if (this.mode === 'terminal' && !this.running && !this.problem && !this.autoStarted) this.post({ type: 'start', auto: true });
    this.autoStarted = true;
  }

  private output(data: string, replay: boolean) {
    this.screen = replay ? data : (this.screen + data).slice(-256 * 1024);
    for (const l of this.listeners) l(data, replay);
    if (replay) return;
    // Agents move the cursor between words instead of printing spaces, so each escape becomes a space.
    const chunk = data.replace(ANSI, ' ').replace(/\s+/g, ' ');
    this.recent = (this.recent + chunk).slice(-1500);
    // Something only the terminal can answer (a permission, a trust prompt): open it, so the learner sees it.
    if (ASKING.test(this.recent) && !this.asking) {
      this.asking = true;
      this.toggle(true);
    }
    if (WORKING.test(chunk)) {
      const words = [...chunk.matchAll(STATUS_WORD)];
      if (words.length) this.doing = words[words.length - 1][1];
      this.working(SETTLED_MS);
    }
  }

  /** An agent is working, and is taken to have stopped once nothing says so for `ms`. */
  private working(ms: number) {
    if (this.mode !== 'terminal') return;
    if (!this.busy) this.busySince = Date.now();
    this.busy = true;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.busy = false;
      this.doing = '';
      this.lastSaid = this.readLastSaid();
    }, ms);
  }

  /** Claude Code prints its replies after a "●" marker ("⏺" in older versions); the text runs until its input box. */
  private readLastSaid(): string {
    const text = this.screen.replace(ANSI, ' ').replace(/[ \t]+/g, ' ');
    const at = Math.max(text.lastIndexOf('●'), text.lastIndexOf('⏺'));
    if (at === -1) return '';
    const said = text
      .slice(at + 1, at + 600)
      .split(/[╭│─>]{2,}|\n\s*\n|\? for shortcuts/)[0]
      .replace(/\s+/g, ' ')
      .trim();
    // Tool calls look like "aristotle - show (MCP)(…)"; only plain sentences are worth showing.
    return /^[\w-]+ - \w+ \(MCP\)|^\w+\(/.test(said) || said.length < 3 ? '' : said.slice(0, 280);
  }

  /** Receives everything shown so far (as a replay), then live output. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.screen, true);
    return () => this.listeners.delete(listener);
  }

  private post(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Raw terminal input. Includes xterm's automatic replies to terminal queries, so it doesn't clear `asking`. */
  input(data: string) {
    this.post({ type: 'input', data });
  }

  /** The learner pressed a key in the terminal: whatever was being asked is being answered. */
  keyed() {
    this.asking = false;
    this.recent = '';
  }

  say(text: string) {
    this.asking = false;
    this.recent = '';
    this.post({ type: 'send', text });
    if (this.running) this.working(STARTING_MS);
  }

  /**
   * Asks the tutor to do something: `command` (a slash command) is typed into an agent that has the skills, `initial`
   * (the same in words) goes to the others and starts an agent that isn't running.
   */
  run(command: string, initial: string) {
    this.asking = false;
    this.recent = '';
    this.post({ type: 'run', text: command, initial });
    this.working(STARTING_MS);
  }

  /** A new sitting: the conversation so far is set aside (an agent's own command for it, or the API tutor's). */
  clear() {
    this.post({ type: 'clear' });
  }

  resize(cols: number, rows: number) {
    this.post({ type: 'resize', cols, rows });
  }

  start(resume = false) {
    this.post({ type: 'start', resume });
  }

  stop() {
    this.post({ type: 'stop' });
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    if (this.open) this.mounted = true;
  }
}

/** The API tutor's last words in its conversation, shown where it waits for the learner. */
function said(entries: TutorEntry[]): string {
  const last = entries.at(-1);
  return last?.kind === 'text' ? last.text.replace(/\s+/g, ' ').trim().slice(0, 280) : '';
}

export const tutor = new Tutor();
