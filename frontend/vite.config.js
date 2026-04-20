import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Repo: Statik51E/AgentIA → GitHub Pages sert sur /AgentIA/
const BASE = '/AgentIA/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.svg', 'icons/icon-512.svg'],
      manifest: {
        name: 'AgentIA — CORE IA ULTIMATE',
        short_name: 'AgentIA',
        description: 'Gestion personnelle intelligente — finances, projets, idées, agent IA.',
        theme_color: '#0a0a0c',
        background_color: '#0a0a0c',
        display: 'standalone',
        orientation: 'portrait',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: 'icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: `${BASE}index.html`,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'firestore', networkTimeoutSeconds: 5 },
          },
          {
            urlPattern: /^https:\/\/api\.groq\.com\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  server: {
    port: 5173,
  },
});
