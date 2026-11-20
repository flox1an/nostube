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
import { extractVideoMeta, extractLiveMeta, buildMetaTags } from './meta.js'
import { buildOEmbed } from './oembed.js'
import { injectMeta } from './template.js'

/** Hard timeout for the entire request handler (ms) */
const REQUEST_TIMEOUT_MS = 8000
/** Live announcements change often (status, title, image): previews must follow within a minute. */
const LIVE_CACHE_SECONDS = 60
const VIDEO_CACHE_SECONDS = 600
const LIVE_KIND = 30311

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

  function getBaseUrl(c: {
    req: { url: string; header: (name: string) => string | undefined }
  }): string {
    const url = new URL(c.req.url)
    // The TLS-terminating proxy must overwrite this header, not pass client input through.
    const proto = c.req.header('X-Forwarded-Proto')?.trim().toLowerCase()
    if (proto === 'https' || proto === 'http') url.protocol = `${proto}:`
    return url.origin
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
    const live = type === 'live'
    if (live && event.kind !== LIVE_KIND) return respondRaw()
    const meta = live ? extractLiveMeta(event) : extractVideoMeta(event)

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

  // Live stream page (the chat-only `/live/:naddr/chat` stays a plain SPA route)
  app.get('/live/:naddr', async c => {
    return handlePage(
      c,
      c.req.param('naddr'),
      'live',
      html => c.html(html, 200, { 'Cache-Control': `public, max-age=${LIVE_CACHE_SECONDS}` }),
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
    if (!parsed || parsed.type === 'playlist') {
      return c.json({ error: 'Video URL not supported' }, 404)
    }

    const decoded = decodeIdentifier(parsed.identifier)
    if (!decoded) {
      return c.json({ error: 'Video URL not supported' }, 404)
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

    const live = parsed.type === 'live'
    if (!event || (live && event.kind !== LIVE_KIND)) {
      return c.json({ error: 'Event not found' }, 404)
    }

    const baseUrl = getBaseUrl(c)
    const meta = live ? extractLiveMeta(event) : extractVideoMeta(event)
    const cacheSeconds = live ? LIVE_CACHE_SECONDS : VIDEO_CACHE_SECONDS

    const embedUrl = `${baseUrl}/embed.html?v=${parsed.identifier}`
    const oembed = buildOEmbed(meta, embedUrl, url, cacheSeconds)

    log('oembed:success', { title: meta.title })
    return c.json(oembed, 200, { 'Cache-Control': `public, max-age=${cacheSeconds}` })
  })

  return app
}

// Default export: inject for all requests (standalone mode)
export default createApp()
