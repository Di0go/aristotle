// The agent CLIs the terminal drawer can run as the tutor, and how to drive each: its command, how to start it with a
// first message or carry on its last conversation, how it starts over, and how it reaches Aristotle's tools. Claude
// Code reads .mcp.json and has the skills (.claude/skills); the others get the MCP server from their own config in
// this folder (opencode.json, .gemini/settings.json, .codex/config.toml) or from flags here, and the method through
// the MCP tool `method` and AGENTS.md.

import path from 'node:path';
import { CLAUDE_CMD, ROOT } from './config.ts';
import { settings } from './settings.ts';
import { AGENTS, type AgentId } from '../shared/tutor.ts';

export interface AgentLaunch {
  id: AgentId;
  /** What the interface calls it: "Claude", "Codex"… */
  name: string;
  file: string;
  /** Arguments to start it: carrying on its last conversation, and with a first message. */
  args(options: { resume: boolean; prompt?: string }): string[];
  env: Record<string, string>;
  /** Typed in to start a new conversation, when it has such a command. */
  clear?: string;
  /** Whether it runs the skills as slash commands ("/teach …"); the others are asked in words. */
  slash: boolean;
  /** Its own words while it works, beside the generic signs (a spinner redrawing). */
  working?: string;
}

/** Waiting for the learner takes minutes: no agent may give up on a quiz or ask before Aristotle does (3 hours at most). */
const TOOL_TIMEOUT_S = 3 * 60 * 60 + 600;

const PRESETS: Record<AgentId, Omit<AgentLaunch, 'id' | 'name' | 'file'> & { command: string }> = {
  'claude-code': {
    command: 'claude',
    args: ({ resume, prompt }) => [...(resume ? ['--continue'] : []), ...(prompt ? [prompt] : [])],
    env: {
      // quiz and ask wait for the learner, often longer than the two minutes after which Claude Code would move a
      // tool call to the background (an extra turn, and an answer lost if the session ends): they stay in front.
      CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS: '0',
    },
    clear: '/clear',
    slash: true,
  },
  codex: {
    command: 'codex',
    // The MCP server is given on the command line (before the `resume` subcommand), so it is there whatever
    // ~/.codex/config.toml says, with its tools approved and a timeout long enough for a question to wait for the
    // learner: Codex gives up on a tool call after 300 s by default, and progress doesn't extend it.
    args: ({ resume, prompt }) => [
      '-c',
      'mcp_servers.aristotle.command="node"',
      '-c',
      `mcp_servers.aristotle.args=[${JSON.stringify(path.join(ROOT, 'server', 'bridge.ts'))}]`,
      '-c',
      `mcp_servers.aristotle.tool_timeout_sec=${TOOL_TIMEOUT_S}`,
      '-c',
      'mcp_servers.aristotle.startup_timeout_sec=30',
      '-c',
      'mcp_servers.aristotle.default_tools_approval_mode="approve"',
      ...(resume ? ['resume', '--last'] : []),
      ...(prompt ? [prompt] : []),
    ],
    env: {},
    clear: '/new',
    slash: false,
    working: 'esc to interrupt',
  },
  gemini: {
    command: 'gemini',
    // .gemini/settings.json in this folder adds the MCP server (trusted, with a long timeout) and has it read AGENTS.md.
    args: ({ resume, prompt }) => [...(resume ? ['--resume', 'latest'] : []), ...(prompt ? ['--prompt-interactive', prompt] : [])],
    env: {},
    clear: '/clear',
    slash: false,
    working: 'esc to cancel',
  },
  opencode: {
    command: 'opencode',
    // opencode.json in this folder adds the MCP server and allows its tools; opencode keeps a call alive while progress
    // comes, so a question can wait. It reads AGENTS.md and the skills in .claude/skills itself.
    args: ({ resume, prompt }) => [...(resume ? ['--continue'] : []), ...(prompt ? ['--prompt', prompt] : [])],
    env: {},
    clear: '/new',
    slash: false,
  },
};

/** The agent the drawer runs now: the one chosen in Settings (Claude Code unless another was), with its command. */
export function currentAgent(): AgentLaunch {
  const id = settings.tutor === 'api' ? 'claude-code' : settings.tutor;
  return agentLaunch(id);
}

export function agentLaunch(id: AgentId): AgentLaunch {
  const preset = PRESETS[id];
  const info = AGENTS.find((a) => a.id === id);
  // ARISTOTLE_CLAUDE_CMD (tests put a shell there) and a command set by hand in settings.json come before the preset.
  const override = process.env.ARISTOTLE_CLAUDE_CMD ? CLAUDE_CMD : settings.agentCommand;
  const [file = preset.command, ...extra] = (override ?? preset.command).split(' ').filter(Boolean);
  return {
    ...preset,
    id,
    name: info?.short ?? id,
    file,
    args: (options) => [...extra, ...preset.args(options)],
  };
}

/** The command an agent runs as, for checking it is installed. */
export function agentCommand(id: AgentId): string {
  return PRESETS[id].command;
}
