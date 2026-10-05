// The connection to Claude Code running inside Aristotle (server/terminal.ts).

type Listener = (data: string, replay: boolean) => void;

interface ServerMessage {
  type: 'state' | 'output' | 'exit';
  running?: boolean;
  data?: string;
  replay?: boolean;
}

// Strips ANSI escape sequences, for reading what is on screen.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
/** Claude Code's status line while it works ("✻ Pondering… (12s · esc to interrupt)"). */
const WORKING = /esc to interrupt/i;
/** The status word in that line, e.g. "Pondering…". */
const STATUS_WORD = /(\p{Lu}\p{Ll}{2,}…)/gu;
/** Claude Code asking something only the terminal can answer: a permission or a trust prompt. */
const ASKING = /Do you want to|Would you like to|Enter to confirm|Esc to cancel/;

class Claude {
  connected = $state(false);
  running = $state(false);
  /** The drawer is showing. */
  open = $state(false);
  /** The drawer has been opened at least once (it stays mounted afterwards). */
  mounted = $state(false);
  /** Output arrived while the drawer was closed. */
  activity = $state(false);
  /** Claude Code seems to be waiting on a prompt in the terminal. */
  asking = $state(false);
  /** Claude is working (its status line says so). Cleared a moment after the status line stops. */
  busy = $state(false);
  /** When the current stretch of work began. */
  busySince = $state(0);
  /** Claude Code's own word for what it is doing ("Pondering…"). */
  doing = $state('');
  /** The last thing Claude said in the terminal, best effort: what to answer when it is waiting on him. */
  lastSaid = $state('');
  private idleTimer: ReturnType<typeof setTimeout> | undefined;

  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private screen = '';
  private recent = '';
  private retry: ReturnType<typeof setTimeout> | undefined;

  connect() {
    if (this.ws) return;
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/terminal`);
    this.ws = ws;
    ws.onopen = () => (this.connected = true);
    ws.onmessage = (e) => this.receive(JSON.parse(e.data) as ServerMessage);
    ws.onclose = () => {
      this.ws = null;
      this.connected = false;
      clearTimeout(this.retry);
      this.retry = setTimeout(() => this.connect(), 2000);
    };
  }

  private receive(msg: ServerMessage) {
    if (msg.type === 'state') {
      this.running = Boolean(msg.running);
      if (!this.running) this.asking = false;
      return;
    }
    if (msg.type !== 'output' || msg.data === undefined) return;
    this.screen = msg.replay ? msg.data : (this.screen + msg.data).slice(-256 * 1024);
    for (const l of this.listeners) l(msg.data, Boolean(msg.replay));
    if (msg.replay) return;
    // Claude Code moves the cursor between words instead of printing spaces, so each escape becomes a space.
    this.recent = (this.recent + msg.data.replace(ANSI, ' ').replace(/\s+/g, ' ')).slice(-1500);
    if (ASKING.test(this.recent)) this.asking = true;
    if (!this.open) this.activity = true;
    const chunk = msg.data.replace(ANSI, ' ').replace(/\s+/g, ' ');
    if (WORKING.test(chunk)) {
      if (!this.busy) this.busySince = Date.now();
      this.busy = true;
      const words = [...chunk.matchAll(STATUS_WORD)];
      if (words.length) this.doing = words[words.length - 1][1];
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => {
        this.busy = false;
        this.doing = '';
        this.lastSaid = this.readLastSaid();
      }, 2500);
    }
  }

  /** Claude Code prints its replies after a "⏺" marker; the text runs until its input box. */
  private readLastSaid(): string {
    const text = this.screen.replace(ANSI, ' ').replace(/[ \t]+/g, ' ');
    const at = text.lastIndexOf('⏺');
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

  /** He pressed a key in the terminal: whatever was being asked is being answered. */
  keyed() {
    this.asking = false;
    this.recent = '';
  }

  say(text: string) {
    this.asking = false;
    this.recent = '';
    this.post({ type: 'send', text });
  }

  /** Asks Claude to do something: `command` is typed in if it is running here, otherwise it starts with `initial`. */
  run(command: string, initial: string) {
    this.asking = false;
    this.recent = '';
    this.post({ type: 'run', text: command, initial });
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
    if (this.open) {
      this.mounted = true;
      this.activity = false;
    }
  }
}

export const claude = new Claude();
