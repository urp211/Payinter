import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Vite + PWA (injectManifest): /src/sw.ts contains precache + runtime rules.
 * The dev server proxies /v1 and /ops to the PayInter API so browser code
 * stays same-origin (no localhost calls from the user's browser).
 */
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      devOptions: { enabled: true, type: 'module' },
      manifest: false, // served from /public/manifest.json
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] }
    })
  ],
  build: { outDir: 'dist-web', sourcemap: false },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/v1': { target: API_TARGET, changeOrigin: true },
      '/ops': { target: API_TARGET, changeOrigin: true }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true
  }
});
