// Claude Code starts this over stdio (see .mcp.json): the core's bridge (@organon/core/server/bridge), which makes
// sure the Aristotle server is running, then relays MCP messages to its /mcp, one POST per message. A call the client
// cancels (Esc while a question waits) closes its request, so the server stops waiting and the learner's answer stays
// for `collect_answers`; a call whose stream ends without an answer gets an error back instead of hanging.
// stdout belongs to the MCP protocol: log to stderr only.

import { runBridge } from '@organon/core/server/bridge';
import { app } from './config.ts';

await runBridge(app, {
  lost: 'Aristotle stopped before answering (it may have restarted). If this was a quiz or ask, call collect_answers to get the answer.',
});
process.exit(0);
