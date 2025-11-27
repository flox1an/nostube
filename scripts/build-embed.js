import esbuild from 'esbuild'
import { readFileSync } from 'fs'

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))

const isDev = process.argv.includes('--watch')

const config = {
  entryPoints: ['src/embed/index.js'],
  bundle: true,
  minify: !isDev,
  target: 'es2020',
  format: 'iife',
  outfile: 'public/nostube-embed.js',
  external: [],
  define: {
    'process.env.NODE_ENV': isDev ? '"development"' : '"production"',
    'process.env.VERSION': `"${packageJson.version}"`,
  },
  banner: {
    js: `/* Nostube Embed Player v${packageJson.version} | https://nostube.com */`,
  },
  sourcemap: isDev,
}

if (isDev) {
  const ctx = await esbuild.context(config)
  await ctx.watch()
  console.log('Watching for changes...')
} else {
  await esbuild.build(config)
  console.log('Build complete!')
}
