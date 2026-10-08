// The tutor in Aristotle's drawer, whichever it is (Settings, settings.ts): an agent CLI in a pseudo-terminal
// (terminal.ts: Claude Code by default, or Codex, Gemini CLI, opencode) or Aristotle's own tutor on a model API
// (tutor-api.ts). Drawers connect over one WebSocket (/api/terminal) and speak one protocol (shared/tutor.ts); when the
// choice changes, the old tutor stops and every drawer is told.

import type { WebSocket } from 'ws';
import { agentLaunch, currentAgent } from './agents.ts';
import { INSTANCE } from './config.ts';
import type { Gym } from './gym.ts';
import { settings } from './settings.ts';
import { Terminal } from './terminal.ts';
import { ApiTutor } from './tutor-api.ts';
import type { TutorClientMessage, TutorMessage } from '../shared/tutor.ts';

export class Tutor {
  private clients = new Set<WebSocket>();
  private engine: Terminal | ApiTutor;
  /** Which tutor runs: the API, or an agent with its command. A change of these replaces it. */
  private key: string;
  private readonly gym: Gym;

  constructor(gym: Gym) {
    this.gym = gym;
    this.key = engineKey();
    this.engine = this.create();
    settings.events.on('change', () => this.reconfigure());
  }

  /** Whether an agent is running in the terminal (the API tutor has nothing to run). */
  get running(): boolean {
    return this.engine instanceof Terminal ? this.engine.running : false;
  }

  /** Connects a drawer: it gets the state and what there is to see, then its messages drive the tutor. */
  attach(ws: WebSocket) {
    this.clients.add(ws);
    for (const msg of this.engine.replay()) sendTo(ws, msg);
    ws.on('message', (raw) => {
      let msg: TutorClientMessage;
      try {
        msg = JSON.parse(String(raw)) as TutorClientMessage;
      } catch {
        return;
      }
      if (typeof msg === 'object' && msg !== null) this.handle(msg);
    });
    ws.on('close', () => this.clients.delete(ws));
    // A malformed frame (invalid UTF-8, too large) closes this socket; unhandled, it would take the server down.
    ws.on('error', () => ws.terminate());
  }

  /** On shutdown: the agent's process goes with the server. */
  stop() {
    this.engine.dispose();
  }

  private handle(msg: TutorClientMessage) {
    const e = this.engine;
    switch (msg.type) {
      case 'start':
        // An agent started by the dev instance would still teach through the live app's MCP server (.mcp.json), so the
        // dev instance never starts one on its own.
        if (e instanceof Terminal && !(msg.auto && INSTANCE === 'dev')) e.start(Boolean(msg.resume));
        return;
      case 'stop':
        return e.stop();
      case 'clear':
        return e.clear();
      case 'input':
        if (typeof msg.data === 'string' && e instanceof Terminal) e.input(msg.data);
        return;
      case 'send':
        if (typeof msg.text === 'string') e.send(msg.text);
        return;
      case 'run':
        if (typeof msg.text === 'string') e.run(msg.text, typeof msg.initial === 'string' ? msg.initial : undefined);
        return;
      case 'resize':
        if (e instanceof Terminal) e.resize(msg.cols, msg.rows);
        return;
    }
  }

  private create(): Terminal | ApiTutor {
    const emit = (msg: TutorMessage) => this.broadcast(msg);
    return settings.tutor === 'api' ? new ApiTutor(this.gym, emit) : new Terminal(currentAgent(), emit);
  }

  /** Settings changed: a different tutor replaces this one; otherwise only its state may have changed (a new model). */
  private reconfigure() {
    const key = engineKey();
    if (key !== this.key) {
      this.key = key;
      this.engine.dispose();
      this.engine = this.create();
      for (const ws of this.clients) for (const msg of this.engine.replay()) sendTo(ws, msg);
      return;
    }
    this.broadcast(this.engine.state());
  }

  private broadcast(msg: TutorMessage) {
    for (const ws of this.clients) sendTo(ws, msg);
  }
}

function engineKey(): string {
  if (settings.tutor === 'api') return 'api';
  const agent = agentLaunch(settings.tutor);
  return `${agent.id} ${agent.file} ${agent.args({ resume: false }).join(' ')}`;
}

function sendTo(ws: WebSocket, msg: TutorMessage) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}
