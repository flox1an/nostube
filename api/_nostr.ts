import { SimplePool } from 'nostr-tools/pool'
import { decode } from 'nostr-tools/nip19'
import type { NostrEvent } from 'nostr-tools/pure'
import type { Filter } from 'nostr-tools/filter'
import { extractVideoMeta, buildMetaTags, type VideoMeta } from '../server/meta.js'
import { buildOEmbed, type OEmbedResponse } from '../server/oembed.js'
import { isBrowser } from '../server/detect.js'
import { injectMeta } from '../server/template.js'

const FALLBACK_RELAYS = [
  'wss://relay.nostu.be',
  'wss://relay.divine.video',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
]

const FETCH_TIMEOUT_MS = 5000

interface DecodedIdentifier {
  type: 'nevent' | 'naddr' | 'note'
  id?: string
  kind?: number
  pubkey?: string
  identifier?: string
  relays: string[]
}

export function decodeIdentifier(nip19str: string): DecodedIdentifier | null {
  try {
    const decoded = decode(nip19str)
    switch (decoded.type) {
      case 'nevent':
        return {
          type: 'nevent',
          id: decoded.data.id,
          kind: decoded.data.kind,
          pubkey: decoded.data.author ?? undefined,
          relays: decoded.data.relays ?? [],
        }
      case 'naddr':
        return {
          type: 'naddr',
          kind: decoded.data.kind,
          pubkey: decoded.data.pubkey,
          identifier: decoded.data.identifier,
          relays: decoded.data.relays ?? [],
        }
      case 'note':
        return {
          type: 'note',
          id: decoded.data,
          relays: [],
        }
      default:
        return null
    }
  } catch {
    return null
  }
}

export async function fetchEvent(decoded: DecodedIdentifier): Promise<NostrEvent | null> {
  const relays = [...new Set([...decoded.relays, ...FALLBACK_RELAYS])]

  const filter: Filter =
    decoded.type === 'naddr'
      ? { kinds: [decoded.kind!], authors: [decoded.pubkey!], '#d': [decoded.identifier!] }
      : { ids: [decoded.id!] }

  const pool = new SimplePool()

  const event = await Promise.race([
    new Promise<NostrEvent | null>(resolve => {
      let settled = false
      const sub = pool.subscribeMany(relays, filter, {
        onevent(ev) {
          if (!settled) {
            settled = true
            sub.close()
            resolve(ev)
          }
        },
        oneose() {
          if (!settled) {
            settled = true
            sub.close()
            resolve(null)
          }
        },
      })
    }),
    new Promise<null>(resolve => setTimeout(() => resolve(null), FETCH_TIMEOUT_MS)),
  ])

  try {
    pool.close(relays)
  } catch {
    /* ignore */
  }

  return event
}

let cachedHtml: string | null = null

async function getIndexHtml(origin: string): Promise<string> {
  if (cachedHtml) return cachedHtml
  const res = await fetch(`${origin}/index.html`)
  cachedHtml = await res.text()
  return cachedHtml
}

type PageType = 'video' | 'short' | 'playlist'

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
    const pageUrl = request.url
    const embedUrl = `${baseUrl}/embed.html#${identifier}`
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

  const parsed = new URL(targetUrl)
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
    return Response.json({ error: 'Could not parse video URL' }, { status: 400 })
  }

  const decoded = decodeIdentifier(identifier)
  if (!decoded) {
    return Response.json({ error: 'Invalid nostr identifier' }, { status: 400 })
  }

  const event = await fetchEvent(decoded)
  if (!event) {
    return Response.json({ error: 'Event not found' }, { status: 404 })
  }

  const baseUrl = reqUrl.origin
  const meta = extractVideoMeta(event)
  const embedUrl = `${baseUrl}/embed.html#${identifier}`
  const oembed = buildOEmbed(meta, embedUrl, targetUrl, type)

  return Response.json(oembed)
}

export { extractVideoMeta, buildMetaTags, buildOEmbed, type VideoMeta, type OEmbedResponse }
