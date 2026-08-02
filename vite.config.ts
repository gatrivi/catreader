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
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
          globIgnores: [
            '**/books/*.pdf',
            '**/books/*.epub',
            '**/feed.json',
            '**/reader/*.json',
            '**/*pdfjs*.js',
            '**/ReaderView-*.js',
            '**/pdf-*.js',
          ],
          // Use runtime caching for books instead
          runtimeCaching: [
            {
              urlPattern: /\/books\/.*\.pdf$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'books-cache',
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
            {
              urlPattern: /\/reader\/.*\.json$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'reader-text',
                expiration: {
                  maxEntries: 100,
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
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // Keep the reader's heavy document engines out of the startup graph.
              // They are loaded only when a book is opened or the user requests PDF.
              if (id.includes('pdfjs-dist') || id.includes('react-pdf') || id.includes('epubjs')) return;
              if (id.includes('motion') || id.includes('framer-motion')) return 'vendor-motion';
              if (id.includes('lucide-react')) return 'vendor-lucide';
              if (id.includes('react')) return 'vendor-react';
              return 'vendor';
            }
          },
        },
      },
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
