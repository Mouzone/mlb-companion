import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'MLB Companion',
        short_name: 'MLB Companion',
        description: 'Live MLB game-watching companion with real-time pitch data and player tendencies',
        theme_color: '#041e42',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        // `any` and `maskable` need separate artwork: `any` is full-bleed, while
        // `maskable` is cropped to an 80%-diameter safe circle by Android launchers.
        // One entry declaring both purposes gets either shrunk or cropped.
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
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
