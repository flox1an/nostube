import { createHash } from 'node:crypto'
import path, { resolve } from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Inlines the entry chunk and the stylesheet into embed.html, then allows the inline scripts in
 * its CSP by hash. Files that cannot be inlined (workers) stay next to embed.html.
 */
const embedSingleFilePlugin = (): Plugin => ({
  name: 'embed-single-file',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const html = bundle['embed.html']
    if (!html || html.type !== 'asset' || typeof html.source !== 'string') {
      throw new Error('Expected embed.html in the generated bundle')
    }

    let source = html.source
    for (const file of Object.values(bundle)) {
      const name = file.fileName.replaceAll('.', '\\.')
      if (file.type === 'chunk' && file.isEntry) {
        const code = file.code.replace(/<(\/script|!--)/gi, '\\x3C$1').trim()
        source = source.replace(
          new RegExp(`<script([^>]*?) src="[^"]*?${name}"([^>]*)></script>`),
          (_, before, after) => `<script${before}${after}>${code}</script>`
        )
      } else if (file.type === 'asset' && file.fileName.endsWith('.css')) {
        const css = String(file.source).replace('@charset "UTF-8";', '').trim()
        source = source.replace(
          new RegExp(`<link([^>]*?) href="[^"]*?${name}"([^>]*)>`),
          (_, before, after) => `<style${before}${after}>${css}</style>`
        )
      } else continue
      delete bundle[file.fileName]
    }

    const scriptHashes = Array.from(
      source.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi),
      match => `'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`
    )
    if (scriptHashes.length === 0) {
      throw new Error('Expected at least one inline script in embed.html')
    }

    html.source = source.replace("script-src 'self'", `script-src 'self' ${scriptHashes.join(' ')}`)
  },
})

export default defineConfig({
  publicDir: false,
  // Relative URLs and a flat output, so what is not inlined loads from next to embed.html.
  base: './',
  plugins: [react(), tailwindcss(), embedSingleFilePlugin()],
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
    assetsDir: '',
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    rolldownOptions: {
      input: resolve(import.meta.dirname, 'embed.html'),
      external: ['@rollup/rollup-linux-x64-gnu'],
      output: { codeSplitting: false },
    },
    // One inlined file by design.
    chunkSizeWarningLimit: 4000,
  },
})
