import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        // Let the reader choose when to reload; never interrupt a page mid-read.
        registerType: 'prompt',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
        manifest: {
          name: 'CatReader',
          short_name: 'CatReader',
          description: 'A magical minimalist book reader',
          theme_color: '#1c1917',
          background_color: '#1c1917',
          lang: 'es-AR',
          display: 'standalone',
          icons: [
            {
              src: 'android-chrome-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'android-chrome-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: 'android-chrome-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          // Exclude books from precache to avoid build errors and huge initial downloads
          globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,json}'],
          globIgnores: ['**/books/*.pdf', '**/books/*.epub', '**/feed.json'],
          // Use runtime caching for books instead. EPUB/TXT should be just as
          // resilient offline as PDFs once the user has opened them.
          runtimeCaching: [
            {
              urlPattern: /\/books\/.*\.(pdf|epub|txt)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'books-cache',
                // Serve correct byte slices when a full PDF is already cached.
                rangeRequests: true,
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 Days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /\/feed\.json$/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'reading-feed',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 1,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        }
      })
    ],
    build: {
      // Default Rollup chunking preserves React.lazy()/dynamic-import boundaries.
      // A manual vendor mega-chunk made PDF.js/Gemini part of library startup.
      chunkSizeWarningLimit: 1000,
    },
    test: {
      globals: true,
      environment: 'jsdom',
    },
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
