<script lang="ts">
  // Settings (#/settings): who teaches, the core's (@organon/core/ui/AgentSettings.svelte): Claude Code by default,
  // another agent CLI in the drawer (Codex, Gemini CLI, opencode) reaching Aristotle over MCP, or Aristotle's own tutor
  // on any OpenAI-compatible model API, hosted or local; and what writes glosses, answers on a passage and the chat.
  // Saved to this install's settings.json (the core's settings); the API key goes in and never comes back out whole.
  // Aristotle's words for it are set in main.ts.
  import AgentSettings from '@organon/core/ui/AgentSettings.svelte';
</script>

<AgentSettings name="Aristotle" />
