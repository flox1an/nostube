import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import app from './index.js'

app.get('/health', c => c.text('healthy\n'))

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
