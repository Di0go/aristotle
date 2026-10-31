// Who teaches, as the server and the interface both see it: the core's engines (Claude Code or another agent CLI in
// the terminal drawer, or a model behind an OpenAI-compatible API), the API providers with their usual addresses, the
// settings the interface reads and changes (GET/PUT /api/settings), and what the drawer's WebSocket carries
// (@organon/core/shared/agents). Aristotle adds nothing to them.

export {
  AGENTS,
  type AgentId,
  type ApiSettingsView,
  type HelperEngine,
  maskKey,
  type ModelInfo,
  PROVIDERS,
  type ProviderId,
  type SettingsBody,
  type SettingsView,
  type TutorClientMessage,
  type TutorEngine,
  type TutorEntry,
  type TutorMessage,
} from '@organon/core/shared/agents';
