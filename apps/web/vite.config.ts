import path, { resolve } from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Instance build (nostube-server): `npm run build:instance`. Boots through
// src/instance-main.ts, which loads /api/config before the app; see src/lib/instance-config.ts.
const instanceBuild = process.env.VITE_INSTANCE_BUILD === 'true'

// The service worker precaches only the app shell (entry + its static imports) plus what the
// start page and the video and shorts pages import statically; watching is the core offline
// case. Every other /assets/ file is cached on first use (runtimeCaching below).
// main.tsx: in the instance build it is a dynamic import of src/instance-main.ts.
const PRECACHED_MODULES =
  /\/src\/(main\.tsx|pages\/(HomePage|VideoPage|ShortsPage|ShortsVideoPage)\.tsx)$/
const precachedAssets = new Set<string>()
const collectPrecachedAssets: Plugin = {
  name: 'collect-precached-assets',
  apply: 'build',
  generateBundle(_, bundle) {
    precachedAssets.clear()
    const visit = (fileName: string) => {
      const chunk = bundle[fileName]
      if (chunk?.type !== 'chunk' || precachedAssets.has(fileName)) return
      precachedAssets.add(fileName)
      chunk.viteMetadata?.importedCss.forEach(css => precachedAssets.add(css))
      chunk.viteMetadata?.importedAssets.forEach(asset => precachedAssets.add(asset))
      chunk.imports.forEach(visit)
    }
    for (const chunk of Object.values(bundle)) {
      // moduleIds, not facadeModuleId: a page that is also imported elsewhere (VideoPage)
      // lands in a chunk without that page as its facade.
      if (
        chunk.type === 'chunk' &&
        (chunk.isEntry || chunk.moduleIds.some(id => PRECACHED_MODULES.test(id)))
      ) {
        visit(chunk.fileName)
      }
    }
  },
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '::',
    port: 8080,
  },
  plugins: [
    react(),
    tailwindcss(),
    instanceBuild && {
      name: 'instance-entry',
      // 'pre': swap the entry before Vite reads the module graph from index.html.
      transformIndexHtml: {
        order: 'pre',
        handler: (html: string) => html.replace('/src/main.tsx', '/src/instance-main.ts'),
      },
    },
    visualizer({
      open: false,
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
    }),
    collectPrecachedAssets,
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        globIgnores: [
          'embed.html',
          'stats.html',
          'embed-*.html',
          'og-image.png',
          // Loaded by the worker itself through importScripts.
          'share-target-sw.js',
        ],
        manifestTransforms: [
          async entries => {
            if (precachedAssets.size === 0) {
              throw new Error('collect-precached-assets found no chunks')
            }
            return {
              manifest: entries.filter(
                entry => !entry.url.startsWith('assets/') || precachedAssets.has(entry.url)
              ),
              warnings: [],
            }
          },
        ],
        runtimeCaching: [
          {
            // Hashed build output is immutable. Same-origin /assets/ only: videos come from
            // Blossom servers (or /api on instances) and are never cached by the worker.
            urlPattern: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'nostube-assets',
              expiration: { maxEntries: 200, purgeOnQuotaError: true },
              plugins: [
                {
                  // The host answers unknown paths with index.html (200): never store that
                  // under a chunk URL, it would stick there for good.
                  cacheWillUpdate: async ({ response }) =>
                    response.status === 200 &&
                    !response.headers.get('Content-Type')?.includes('text/html')
                      ? response
                      : null,
                },
              ],
            },
          },
        ],
        // POST /share-target (manifest share_target): stores the shared video for /upload.
        importScripts: ['/share-target-sw.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/embed/,
          /^\/\.well-known\//,
          // Server endpoints must never become the SPA shell.
          ...(instanceBuild ? [/^\/api\//, /^\/admin(?:\/|$)/] : []),
        ],
        navigateFallbackAllowlist: [/^\/(?!assets\/)/],
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: false,
      injectRegister: 'auto',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**', '**/.worktrees/**'],
  },
  worker: {
    format: 'es',
  },
  build: {
    sourcemap: false, // Disable sourcemaps in production for smaller bundle
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
      },
    },
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
      },
      // Disable native modules for Vercel deployment
      external: ['@rollup/rollup-linux-x64-gnu'],
      output: {
        // 10-char hashes (default 8) renamed every chunk once: the old server cached
        // HTML fallbacks under chunk URLs as immutable, so those URLs stay poisoned.
        chunkFileNames: 'assets/[name]-[hash:10].js',
        strictExecutionOrder: true,
        codeSplitting: {
          minSize: 20000,
          minShareCount: 2,
          groups: [
            // Only the modules actually needed before first render (the static
            // import chain from index.html) get bucketed here. Anything only
            // reachable through a lazy `import()` (route pages, video codecs,
            // etc.) is left to rolldown's automatic per-route chunking below,
            // so it never gets pulled into the initial pageload.
            {
              name: 'vendor',
              test: /node_modules/,
              tags: ['$initial'],
              priority: 1,
            },
            {
              name: 'app',
              tags: ['$initial'],
            },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 1100,
  },
})
