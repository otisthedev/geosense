import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2018',
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          leaflet: ['leaflet'],
        },
      },
    },
  },
});
