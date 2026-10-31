// The agent CLIs the terminal drawer can run as the tutor, and how to drive each: the core's
// (@organon/core/server/agents) for Aristotle: its command, how to start it with a first message or carry on its last
// conversation, how it starts over, and how it reaches Aristotle's tools (Codex is told to start server/bridge.ts).
// Claude Code reads .mcp.json and has the skills (.claude/skills); the others get the MCP server from their own config
// in this folder (opencode.json, .gemini/settings.json, .codex/config.toml) or from flags, and the method through the
// MCP tool `method` and AGENTS.md.

import { createAgents } from '@organon/core/server/agents';
import { app } from './config.ts';
import { settings } from './settings.ts';

export { type AgentLaunch, agentCommand } from '@organon/core/server/agents';

export const agents = createAgents({ app, settings });
export const agentLaunch = agents.launch;
export const currentAgent = agents.current;
