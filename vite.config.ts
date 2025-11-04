import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '::',
    port: 8080,
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
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
      // Disable native modules for Vercel deployment
      external: ['@rollup/rollup-linux-x64-gnu'],
      output: {
        inlineDynamicImports: false,
        // Increase minimum chunk size to reduce number of small files
        chunkFileNames: 'assets/[name]-[hash].js',
        manualChunks: id => {
          // Vendor chunks for node_modules
          if (id.includes('node_modules')) {
            // Separate only the largest video libraries
            if (id.includes('hls.js')) return 'vendor-hls'
            if (id.includes('video.js') || id.includes('media-chrome')) return 'vendor-video'

            // Everything else stays together in vendor to ensure proper initialization
            return 'vendor'
          }

          // Combine small hooks into one chunk
          if (id.includes('/src/hooks/') && !id.includes('node_modules')) {
            return 'hooks'
          }

          // Combine utility files and lib
          if (
            (id.includes('/src/lib/') || id.includes('/src/utils/')) &&
            !id.includes('node_modules')
          ) {
            return 'utils'
          }

          // Combine nostr utilities
          if (id.includes('/src/nostr/') && !id.includes('node_modules')) {
            return 'nostr'
          }

          // Combine contexts
          if (id.includes('/src/contexts/') && !id.includes('node_modules')) {
            return 'contexts'
          }

          // Group small UI components together
          if (id.includes('/src/components/ui/') && !id.includes('node_modules')) {
            // Group by related components to avoid circular deps
            if (
              id.includes('button') ||
              id.includes('badge') ||
              id.includes('card') ||
              id.includes('label') ||
              id.includes('separator')
            ) {
              return 'ui-basic'
            }
            if (
              id.includes('dialog') ||
              id.includes('alert') ||
              id.includes('sheet') ||
              id.includes('dropdown') ||
              id.includes('popover')
            ) {
              return 'ui-overlays'
            }
            if (
              id.includes('form') ||
              id.includes('input') ||
              id.includes('textarea') ||
              id.includes('checkbox') ||
              id.includes('select')
            ) {
              return 'ui-forms'
            }
            return 'ui-misc'
          }
        },
      },
    },
    chunkSizeWarningLimit: 1100,
  },
})
