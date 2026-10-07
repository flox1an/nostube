import path, { resolve } from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Instance build (nostube-server): `npm run build:instance`. Boots through
// src/instance-main.ts, which loads /api/config before the app; see src/lib/instance-config.ts.
const instanceBuild = process.env.VITE_INSTANCE_BUILD === 'true'

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
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        globIgnores: ['embed.html', 'stats.html', 'embed-*.html'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          /^\/embed/,
          /^\/\.well-known\//,
          // The instance's own endpoints (/api/config is no-store) are never the SPA shell.
          ...(instanceBuild ? [/^\/api\//] : []),
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
