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
        start_url: '/',
        id: '/',
        scope: '/',
        categories: ['sports'],
        shortcuts: [
          {
            name: 'Most watchable games',
            short_name: 'Most watchable',
            url: '/?sort=watchability',
            description: "Today's slate ranked by watchability",
          },
        ],
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
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          // Ratings are a whole-slate snapshot rebuilt twice daily (07:00 and
          // 12:00 ET). NetworkFirst ensures the morning reload picks up the
          // fresh payload without a hard refresh, while the 4s timeout falls
          // back to cache on dead-air connections so scores still render offline.
          {
            urlPattern: ({ url }) => url.pathname === '/watchability.json',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mlb-watchability',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 4, maxAgeSeconds: 86400 },
            },
          },
          // Every diffPatch URL embeds a fresh startTimecode, so caching them would
          // add ~15 unique entries a minute and evict everything else worth keeping
          // offline. They are also worthless once consumed. Must precede the general
          // statsapi rule.
          {
            urlPattern: /^https:\/\/statsapi\.mlb\.com\/.*\/diffPatch/,
            handler: 'NetworkOnly',
          },
          // Cohort responses are multi-megabyte and shared by every game, so they get
          // their own long-lived bucket rather than competing with per-game requests.
          {
            urlPattern: /^https:\/\/statsapi\.mlb\.com\/api\/v1\/stats\?.*limit=2000/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'mlb-cohorts',
              expiration: { maxEntries: 6, maxAgeSeconds: 86400 },
            },
          },
          // Without a timeout these hang on the dead-air mobile connections this app
          // is actually used on (ballpark wifi, cellular) instead of falling back to
          // cache, so the fallback that justifies NetworkFirst never fires.
          {
            urlPattern: /^https:\/\/statsapi\.mlb\.com\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mlb-statsapi',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
          {
            urlPattern: /^https:\/\/baseballsavant\.mlb\.com\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mlb-savant',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 20, maxAgeSeconds: 600 },
            },
          },
          // Logos and headshots are immutable per player/team, so cache-first keeps
          // the UI from falling back to placeholders the moment signal drops.
          {
            urlPattern: /^https:\/\/([a-z]+\.)?mlbstatic\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mlb-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 604800 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
