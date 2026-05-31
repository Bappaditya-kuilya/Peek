import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
    // Single source of truth: the receiver lives in /receiver.
    // Copy it into the build output (and serve it in dev) at /receiver
    // so we never maintain a second copy under web/public/.
    viteStaticCopy({
      targets: [{ src: '../receiver/*', dest: 'receiver' }],
    }),
  ],
});
