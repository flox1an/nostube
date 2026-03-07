import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import app from './index'

// Serve static files from dist/
app.use('/*', serveStatic({ root: './dist' }))

const port = parseInt(process.env.PORT || '8080', 10)
console.log(`Server running at http://localhost:${port}`)
serve({ fetch: app.fetch, port })
