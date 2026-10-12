import {defineConfig} from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5178,
    strictPort: true,
    // Preserve the browser-facing Host so exact same-origin user approvals also
    // work through the local dev proxy. Backend origin checks stay unchanged.
    proxy: {'/api': {target: process.env.BACKEND_URL || 'http://127.0.0.1:8017', changeOrigin: false}}
  },
  preview: {host: '127.0.0.1', strictPort: true},
  build: {outDir: 'dist'}
});
