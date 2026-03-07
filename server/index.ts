import { Hono } from 'hono'
import { readFileSync } from 'fs'
import { join } from 'path'
import { isBrowser } from './detect'
import { decodeIdentifier, fetchEvent } from './nostr'
import { extractVideoMeta, buildMetaTags } from './meta'
import { buildOEmbed } from './oembed'
import { injectMeta } from './template'

export interface AppOptions {
  // When true, skip meta injection for browser user agents (Vercel mode)
  skipBrowsers?: boolean
}

export function createApp(options: AppOptions = {}) {
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

  type PageType = 'video' | 'short' | 'playlist'

  async function handlePage(
    c: { req: { url: string; header: (name: string) => string | undefined } },
    identifier: string,
    type: PageType,
    respondHtml: (html: string) => Response,
    respondRaw: () => Response
  ) {
    if (options.skipBrowsers && isBrowser(c.req.header('user-agent'))) {
      return respondRaw()
    }

    const decoded = decodeIdentifier(identifier)
    if (!decoded) {
      return respondRaw()
    }

    const event = await fetchEvent(decoded)
    if (!event) {
      return respondRaw()
    }

    const baseUrl = getBaseUrl(c)
    const meta = extractVideoMeta(event)
    const pageUrl = c.req.url
    const embedUrl = `${baseUrl}/embed.html#${identifier}`
    const oembedUrl = `${baseUrl}/oembed?url=${encodeURIComponent(pageUrl)}&format=json`

    const metaTags = buildMetaTags(meta, pageUrl, embedUrl, oembedUrl, type)
    const html = injectMeta(getIndexHtml(), metaTags, meta.title)

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

    // Parse the URL to extract the identifier
    const parsed = new URL(url)
    const pathParts = parsed.pathname.split('/')
    let identifier: string | null = null
    let type: PageType = 'video'

    if (pathParts[1] === 'v' && pathParts[2]) {
      identifier = pathParts[2]
      type = 'video'
    } else if (pathParts[1] === 'short' && pathParts[2]) {
      identifier = pathParts[2]
      type = 'short'
    } else if (pathParts[1] === 'playlist' && pathParts[2]) {
      identifier = pathParts[2]
      type = 'playlist'
    }

    if (!identifier) {
      return c.json({ error: 'Could not parse video URL' }, 400)
    }

    const decoded = decodeIdentifier(identifier)
    if (!decoded) {
      return c.json({ error: 'Invalid nostr identifier' }, 400)
    }

    const event = await fetchEvent(decoded)
    if (!event) {
      return c.json({ error: 'Event not found' }, 404)
    }

    const baseUrl = getBaseUrl(c)
    const meta = extractVideoMeta(event)
    const embedUrl = `${baseUrl}/embed.html#${identifier}`
    const oembed = buildOEmbed(meta, embedUrl, url, type)

    return c.json(oembed)
  })

  return app
}

// Default export: inject for all requests (standalone mode)
export default createApp()
