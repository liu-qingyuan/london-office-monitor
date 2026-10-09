import {defineConfig} from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5178,
    strictPort: true,
    proxy: {'/api': {target: process.env.BACKEND_URL || 'http://127.0.0.1:8017', changeOrigin: true}}
  },
  preview: {host: '127.0.0.1', strictPort: true},
  build: {outDir: 'dist'}
});
