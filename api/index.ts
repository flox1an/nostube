import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import { decodeIdentifier, fetchEvent, log } from '../server/nostr.js'
import { extractVideoMeta } from '../server/meta.js'

const app = new Hono()

// Health check
app.get('/api', c => {
  log('health:ok')
  return c.json({ ok: true, ts: Date.now() })
})

// Test route — resolves a hardcoded naddr to verify relay fetch works
app.get('/api/test', async c => {
  const naddr =
    'naddr1qvzqqqy9hvpzpd7x76g4e756vtlldg0syczdazxz83kxcmgm3a3v0nqswj0nql5pqyt8wumn8ghj7un9d3shjtnswf5k6ctv9ehx2aqpz3mhxue69uhhyetvv9ujuerpd46hxtnfduq32amnwvaz7tmjv4kxz7fj9eskuem0wghxjmcqysurzepj89sngvedx43nqcedx33k2cedvfnr2ded8yukgef3v33ngcmxvccsa86rkw'

  log('test:start')

  const decoded = decodeIdentifier(naddr)
  if (!decoded) {
    log('test:decode failed')
    return c.json({ error: 'decode failed' }, 500)
  }

  log('test:decoded', { type: decoded.type, relays: decoded.relays, kind: decoded.kind })

  const event = await Promise.race([
    fetchEvent(decoded),
    new Promise<null>(resolve =>
      setTimeout(() => {
        log('test:timeout')
        resolve(null)
      }, 8000)
    ),
  ])

  if (!event) {
    log('test:no event')
    return c.json({ error: 'event not found or timed out', decoded }, 404)
  }

  const meta = extractVideoMeta(event)
  log('test:success', { title: meta.title, eventId: event.id })

  return c.json({
    ok: true,
    decoded,
    event: { id: event.id, kind: event.kind, pubkey: event.pubkey, created_at: event.created_at },
    meta,
  })
})

export default handle(app)
