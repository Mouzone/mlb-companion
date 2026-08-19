import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'MLB Companion',
        short_name: 'MLB Companion',
        description: 'Live MLB game-watching companion with real-time pitch data and player tendencies',
        theme_color: '#1b3a2f',
        background_color: '#0d1b12',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/statsapi\.mlb\.com\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mlb-statsapi',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
          {
            urlPattern: /^https:\/\/baseballsavant\.mlb\.com\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mlb-savant',
              expiration: { maxEntries: 20, maxAgeSeconds: 600 },
            },
          },
        ],
      },
    }),
  ],
})
