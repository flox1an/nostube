import { Hono } from 'hono'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  decodeIdentifier,
  fetchEvent,
  parsePageUrl,
  buildPageUrl,
  log,
  type PageType,
} from './nostr.js'
import { extractVideoMeta, buildMetaTags } from './meta.js'
import { buildOEmbed } from './oembed.js'
import { injectMeta } from './template.js'

/** Hard timeout for the entire request handler (ms) */
const REQUEST_TIMEOUT_MS = 8000

export function createApp() {
  const app = new Hono()

  // Cache the index.html template
  let indexHtml: string | null = null
  function getIndexHtml(): string {
    if (!indexHtml) {
      indexHtml = readFileSync(
        join(import.meta.dirname ?? '.', '..', 'dist', 'index.html'),
        'utf-8'
      )
    }
    return indexHtml
  }

  function getBaseUrl(c: { req: { url: string } }): string {
    const url = new URL(c.req.url)
    return `${url.protocol}//${url.host}`
  }

  async function handlePage(
    c: { req: { url: string; header: (name: string) => string | undefined } },
    identifier: string,
    type: PageType,
    respondHtml: (html: string) => Response,
    respondRaw: () => Response
  ) {
    const ua = c.req.header('user-agent') ?? '<none>'
    log('handlePage:start', {
      url: c.req.url,
      type,
      identifier: identifier.slice(0, 30) + '…',
      ua: ua.slice(0, 80),
    })

    const decoded = decodeIdentifier(identifier)
    if (!decoded) {
      log('handlePage:decode failed')
      return respondRaw()
    }

    log('handlePage:decoded', { decodedType: decoded.type, relays: decoded.relays })

    // Wrap fetch in a hard request timeout so the function never hangs
    const event = await Promise.race([
      fetchEvent(decoded),
      new Promise<null>(resolve =>
        setTimeout(() => {
          log('handlePage:hard timeout', { ms: REQUEST_TIMEOUT_MS })
          resolve(null)
        }, REQUEST_TIMEOUT_MS)
      ),
    ])

    if (!event) {
      log('handlePage:no event, serving SPA shell')
      return respondRaw()
    }

    log('handlePage:event found', { eventId: event.id, kind: event.kind })

    const baseUrl = getBaseUrl(c)
    const meta = extractVideoMeta(event)
    const pageUrl = buildPageUrl(baseUrl, type, identifier)
    const embedUrl = `${baseUrl}/embed.html?v=${identifier}`
    const oembedUrl = `${baseUrl}/oembed?url=${encodeURIComponent(pageUrl)}&format=json`

    const metaTags = buildMetaTags(meta, pageUrl, embedUrl, oembedUrl, type, baseUrl)
    const html = injectMeta(getIndexHtml(), metaTags, meta.title)

    log('handlePage:injected meta', { title: meta.title })
    return respondHtml(html)
  }

  // Video page
  app.get('/v/:nevent', async c => {
    return handlePage(
      c,
      c.req.param('nevent'),
      'video',
      html => c.html(html),
      () => c.html(getIndexHtml())
    )
  })

  // Short page
  app.get('/short/:nevent', async c => {
    return handlePage(
      c,
      c.req.param('nevent'),
      'short',
      html => c.html(html),
      () => c.html(getIndexHtml())
    )
  })

  // Playlist page
  app.get('/playlist/:nip19', async c => {
    return handlePage(
      c,
      c.req.param('nip19'),
      'playlist',
      html => c.html(html),
      () => c.html(getIndexHtml())
    )
  })

  // oEmbed endpoint
  app.get('/oembed', async c => {
    const url = c.req.query('url')
    if (!url) {
      return c.json({ error: 'Missing url parameter' }, 400)
    }

    const parsed = parsePageUrl(new URL(url).pathname)
    if (!parsed) {
      return c.json({ error: 'Could not parse video URL' }, 400)
    }

    const decoded = decodeIdentifier(parsed.identifier)
    if (!decoded) {
      return c.json({ error: 'Invalid nostr identifier' }, 400)
    }

    log('oembed:fetch', { type: parsed.type, identifier: parsed.identifier.slice(0, 30) })

    const event = await Promise.race([
      fetchEvent(decoded),
      new Promise<null>(resolve =>
        setTimeout(() => {
          log('oembed:hard timeout', { ms: REQUEST_TIMEOUT_MS })
          resolve(null)
        }, REQUEST_TIMEOUT_MS)
      ),
    ])

    if (!event) {
      return c.json({ error: 'Event not found' }, 404)
    }

    const baseUrl = getBaseUrl(c)
    const meta = extractVideoMeta(event)
    const embedUrl = `${baseUrl}/embed.html?v=${parsed.identifier}`
    const oembed = buildOEmbed(meta, embedUrl, url, parsed.type)

    log('oembed:success', { title: meta.title })
    return c.json(oembed)
  })

  return app
}

// Default export: inject for all requests (standalone mode)
export default createApp()
