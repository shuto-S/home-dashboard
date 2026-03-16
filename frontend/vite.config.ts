import legacy from '@vitejs/plugin-legacy';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    legacy({
      targets: ['Android >= 5', 'Chrome >= 49', 'Safari >= 12'],
      modernPolyfills: true,
      renderLegacyChunks: true
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true
  }
});