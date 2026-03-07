import {
  decodeIdentifier,
  fetchEvent,
  parsePageUrl,
  buildPageUrl,
  type PageType,
} from '../server/nostr.js'
import { extractVideoMeta, buildMetaTags, type VideoMeta } from '../server/meta.js'
import { buildOEmbed, type OEmbedResponse } from '../server/oembed.js'
import { isBrowser } from '../server/detect.js'
import { injectMeta } from '../server/template.js'

let cachedHtml: string | null = null

async function getIndexHtml(origin: string): Promise<string> {
  if (cachedHtml) return cachedHtml
  const res = await fetch(`${origin}/index.html`)
  cachedHtml = await res.text()
  return cachedHtml
}

async function serveSpa(origin: string): Promise<Response> {
  const html = await getIndexHtml(origin)
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

export async function handleVideoPage(
  request: Request,
  identifier: string,
  type: PageType
): Promise<Response> {
  const url = new URL(request.url)

  try {
    const ua = request.headers.get('user-agent') ?? ''

    // Browsers get the normal SPA — only bots get injected meta
    if (isBrowser(ua)) {
      return serveSpa(url.origin)
    }

    const decoded = decodeIdentifier(identifier)
    if (!decoded) {
      return serveSpa(url.origin)
    }

    const event = await fetchEvent(decoded)
    if (!event) {
      return serveSpa(url.origin)
    }

    const baseUrl = url.origin
    const meta = extractVideoMeta(event)
    const pageUrl = buildPageUrl(baseUrl, type, identifier)
    const embedUrl = `${baseUrl}/embed.html?v=${identifier}`
    const oembedUrl = `${baseUrl}/oembed?url=${encodeURIComponent(pageUrl)}&format=json`

    const metaTags = buildMetaTags(meta, pageUrl, embedUrl, oembedUrl, type)
    const rawHtml = await getIndexHtml(url.origin)
    const html = injectMeta(rawHtml, metaTags, meta.title)

    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  } catch {
    // Any failure falls back to the unmodified SPA
    return serveSpa(url.origin)
  }
}

export async function handleOEmbed(request: Request): Promise<Response> {
  const reqUrl = new URL(request.url)
  const targetUrl = reqUrl.searchParams.get('url')

  if (!targetUrl) {
    return Response.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  const parsed = parsePageUrl(new URL(targetUrl).pathname)
  if (!parsed) {
    return Response.json({ error: 'Could not parse video URL' }, { status: 400 })
  }

  const decoded = decodeIdentifier(parsed.identifier)
  if (!decoded) {
    return Response.json({ error: 'Invalid nostr identifier' }, { status: 400 })
  }

  const event = await fetchEvent(decoded)
  if (!event) {
    return Response.json({ error: 'Event not found' }, { status: 404 })
  }

  const baseUrl = reqUrl.origin
  const meta = extractVideoMeta(event)
  const embedUrl = `${baseUrl}/embed.html?v=${parsed.identifier}`
  const oembed = buildOEmbed(meta, embedUrl, targetUrl, parsed.type)

  return Response.json(oembed)
}

export { extractVideoMeta, buildMetaTags, buildOEmbed, type VideoMeta, type OEmbedResponse }
