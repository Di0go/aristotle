import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// In dev (scripts/dev.ts) Vite serves the interface with hot reload and forwards everything else to the dev
// server: the API, its event stream, the terminal's WebSocket and the MCP endpoint.
const target = `http://127.0.0.1:${process.env.ARISTOTLE_PORT ?? 4757}`;

export default defineConfig({
  root: 'ui',
  plugins: [svelte()],
  build: { outDir: '../dist/ui', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  server: {
    port: Number(process.env.ARISTOTLE_VITE_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/api': { target, ws: true },
      '/mcp': target,
    },
  },
});
