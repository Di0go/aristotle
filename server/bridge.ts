// Claude Code starts this over stdio (see .mcp.json). It makes sure the Mind Gym server is running,
// then relays MCP messages to it, so opening Claude Code in this folder is all it takes.
// stdout belongs to the MCP protocol: log to stderr only.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { PORT } from './config.ts';
import { LOG_FILE, start } from './control.ts';

if (!(await start())) {
  console.error(`Mind Gym: the server did not start; see ${LOG_FILE}`);
  process.exit(1);
}

const upstream = new StreamableHTTPClientTransport(new URL(`http://localhost:${PORT}/mcp`));
const local = new StdioServerTransport();

local.onmessage = (message) => {
  upstream.send(message).catch((err: unknown) => console.error('Mind Gym bridge:', err));
};
upstream.onmessage = (message) => {
  void local.send(message);
};
upstream.onerror = (err) => console.error('Mind Gym bridge:', err);
local.onclose = () => {
  void upstream.close().finally(() => process.exit(0));
};

await upstream.start();
await local.start();
