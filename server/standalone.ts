import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import app from './index.js'

const runtimeConfig = {
  RELAYS: process.env.RUNTIME_RELAYS ?? 'wss://relay.divine.video,wss://nos.lol',
  BLOSSOM_SERVERS: process.env.RUNTIME_BLOSSOM_SERVERS ?? 'https://almond.slidestr.net',
  APP_TITLE: process.env.RUNTIME_APP_TITLE ?? 'Nostube',
  DEBUG: process.env.RUNTIME_DEBUG ?? 'false',
  CUSTOM_CONFIG: process.env.RUNTIME_CUSTOM_CONFIG ?? null,
  BUILD_TIME: new Date().toISOString(),
}
const runtimeEnv = `window.__RUNTIME_ENV__ = ${JSON.stringify(runtimeConfig)};
window.__RUNTIME_ENV__.parseCSV = value => value ? value.split(',').map(item => item.trim()).filter(Boolean) : [];
`

app.get('/health', c => c.text('healthy\n'))
app.get('/runtime-env.js', c =>
  c.body(runtimeEnv, 200, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/javascript; charset=UTF-8',
  })
)

// Preserve Vercel's static response contract. Only real files are immutable: a
// 404 during a deploy must not be cached for a year under a chunk's URL.
app.use('/assets/*', async (c, next) => {
  await next()
  c.header(
    'Cache-Control',
    c.res.status === 200 ? 'public, max-age=31536000, immutable' : 'no-store'
  )
})
app.use('/manifest.webmanifest', async (c, next) => {
  await next()
  c.header('Cache-Control', 'public, max-age=3600')
  c.header('Content-Type', 'application/manifest+json')
})
app.use('/.well-known/*', async (c, next) => {
  await next()
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Content-Type', 'application/json')
})
app.use('/*', serveStatic({ root: './dist' }))
// A missing hashed asset is a stale or mid-deploy reference: answer 404, never the
// SPA shell, which browsers would reject as a module (text/html MIME) or cache as JS.
app.get('/assets/*', c => c.notFound())
app.get('*', serveStatic({ root: './dist', path: 'index.html' }))

const port = parseInt(process.env.PORT || '8080', 10)
console.log(`Server running at http://localhost:${port}`)
serve({ fetch: app.fetch, port })
