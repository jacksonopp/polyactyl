import { resolve } from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
      },
    },
    plugins: [
      react(),
      // Remove crossorigin attributes added by Vite. On macOS arm64, Electron's
      // file:// protocol CORS check fails for crossorigin module scripts, causing
      // the JS to be rendered as plain text instead of executed.
      {
        name: 'remove-crossorigin',
        transformIndexHtml(html: string) {
          return html.replace(/ crossorigin(?:="[^"]*")?/g, '');
        },
      },
    ],
  },
});
