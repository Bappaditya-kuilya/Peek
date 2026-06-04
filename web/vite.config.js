import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
    // Single source of truth: the static receiver lives in /web/receiver-src.
    viteStaticCopy({
      targets: [{ src: './receiver-src/*', dest: 'receiver' }],
    }),
  ],
});
