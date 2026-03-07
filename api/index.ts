import { Hono } from 'hono'
import { handle } from 'hono/vercel'

const app = new Hono()

// Health check — hit /api to verify the function boots
app.get('/api', c => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), msg: 'health:ok' }))
  return c.json({ ok: true, ts: Date.now() })
})

export default handle(app)
