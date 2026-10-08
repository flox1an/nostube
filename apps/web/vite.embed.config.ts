import { createHash } from 'node:crypto'
import path, { resolve } from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

const embedCspPlugin = (): Plugin => ({
  name: 'embed-csp',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const html = bundle['embed.html']
    if (!html || html.type !== 'asset' || typeof html.source !== 'string') {
      throw new Error('Expected embed.html in the generated bundle')
    }

    const scriptHashes = Array.from(
      html.source.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi),
      match => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`
    )
    if (scriptHashes.length === 0) {
      throw new Error('Expected at least one inline script in embed.html')
    }

    html.source = html.source.replace(
      "script-src 'self'",
      `script-src 'self' ${scriptHashes.join(' ')}`
    )
  },
})

export default defineConfig({
  publicDir: false,
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile({ removeViteModuleLoader: true }),
    embedCspPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  worker: {
    format: 'es',
  },
  build: {
    emptyOutDir: false,
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rolldownOptions: {
      input: resolve(import.meta.dirname, 'embed.html'),
      external: ['@rollup/rollup-linux-x64-gnu'],
    },
    chunkSizeWarningLimit: 1100,
  },
})
