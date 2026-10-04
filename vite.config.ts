import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const port = Number(process.env.GYM_PORT ?? 4747);

export default defineConfig({
  root: 'ui',
  plugins: [svelte()],
  build: { outDir: '../dist/ui', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${port}` },
  },
});
