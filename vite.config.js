import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// GitHub Pages serves the app from /<repo-name>/. Set VITE_BASE in the deploy
// workflow (or leave "./" so the build also works from any folder, and from
// the desktop app's file:// pages).
export default defineConfig({
  base: process.env.VITE_BASE || './',
  build: {
    rollupOptions: {
      // web prototype + desktop app control panel
      input: { main: resolve(import.meta.dirname, 'index.html'), desktop: resolve(import.meta.dirname, 'desktop.html') },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
