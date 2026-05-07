import path, { resolve } from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '::',
    port: 8080,
  },
  plugins: [
    react(),
    tailwindcss(),
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
        navigateFallbackDenylist: [/^\/embed/, /^\/\.well-known\//],
        navigateFallbackAllowlist: [/^\/(?!assets\/)/],
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: false,
      injectRegister: 'auto',
    }),
    viteSingleFile({
      useRecommendedBuildConfig: false,
      removeViteModuleLoader: true,
      inlinePattern: ['embed/**/*'],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        embed: resolve(__dirname, 'embed.html'),
      },
      // Disable native modules for Vercel deployment
      external: ['@rollup/rollup-linux-x64-gnu'],
      output: {
        inlineDynamicImports: false,
        chunkFileNames: 'assets/[name]-[hash].js',
        // Use experimental min chunk size instead of manual chunking
        // This allows Vite to automatically optimize chunk sizes
        experimentalMinChunkSize: 20000, // 20kb minimum
      },
    },
    chunkSizeWarningLimit: 1100,
  },
})
