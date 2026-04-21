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
      includeAssets: ['icons/agia.png'],
      manifest: {
        name: 'AgIa — Gestion personnelle intelligente',
        short_name: 'AgIa',
        description: 'AgIa — finances, projets, idées, chatbot IA expert.',
        theme_color: '#0a0a0c',
        background_color: '#0a0a0c',
        display: 'standalone',
        orientation: 'portrait',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: 'icons/agia.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/agia.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
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
