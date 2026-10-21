import { beforeEach, describe, expect, it, vi } from 'vitest'
import { naddrEncode, neventEncode, noteEncode, npubEncode } from 'nostr-tools/nip19'
import type { NostrEvent } from 'nostr-tools/pure'
import type * as Fs from 'fs'

import { createApp } from './index.js'
import { fetchEvent } from './nostr.js'
import type * as Nostr from './nostr.js'

vi.mock('./nostr.js', async importOriginal => ({
  ...(await importOriginal<typeof Nostr>()),
  fetchEvent: vi.fn(),
}))
vi.mock('fs', async importOriginal => {
  const fs = await importOriginal<typeof Fs>()
  const readFileSync = () => '<html><head><title>nostube</title></head><body></body></html>'
  return { ...fs, readFileSync, default: { ...fs, readFileSync } }
})

const origin = 'https://videos.example'
const event: NostrEvent = {
  id: 'a'.repeat(64),
  pubkey: 'b'.repeat(64),
  sig: 'c'.repeat(128),
  kind: 34235,
  created_at: 1,
  content: 'A video description',
  tags: [
    ['d', 'example'],
    ['title', 'Example video'],
    [
      'imeta',
      'url https://cdn.example/video.mp4',
      'm video/mp4',
      'dim 1920x1080',
      'image https://cdn.example/thumb.jpg',
    ],
  ],
}
const identifier = naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: 'example' })
const videoUrl = `${origin}/v/${identifier}`
const requestUrl = (url: string) => `${origin}/oembed?url=${encodeURIComponent(url)}&format=json`

beforeEach(() => {
  vi.mocked(fetchEvent).mockReset()
  vi.mocked(fetchEvent).mockResolvedValue(event)
})

describe('video oEmbed HTTP contract', () => {
  it('returns the designed video player and metadata for a valid video URL', async () => {
    const response = await createApp().request(requestUrl(videoUrl))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('cache-control')).toBe('public, max-age=600')
    expect(await response.json()).toEqual({
      version: '1.0',
      type: 'video',
      provider_name: 'Nostube',
      provider_url: origin,
      title: 'Example video',
      author_name: npubEncode(event.pubkey),
      author_url: `${origin}/p/${npubEncode(event.pubkey)}`,
      thumbnail_url: 'https://cdn.example/thumb.jpg',
      html: `<iframe src="${origin}/embed.html?v=${identifier}" width="640" height="360" frameborder="0" allowfullscreen allow="autoplay; fullscreen"></iframe>`,
      width: 640,
      height: 360,
      cache_age: 600,
    })
  })

  it('uses the HTTPS proxy scheme for the embedded player', async () => {
    const response = await createApp().request(requestUrl(videoUrl).replace('https:', 'http:'), {
      headers: { 'X-Forwarded-Proto': 'https' },
    })
    const body = await response.json()
    expect(body.html).toContain(`src="${origin}/embed.html?v=${identifier}"`)
    expect(body.provider_url).toBe(origin)
  })

  it('ignores an invalid forwarded scheme', async () => {
    const response = await createApp().request(requestUrl(videoUrl), {
      headers: { 'X-Forwarded-Proto': 'javascript' },
    })
    expect((await response.json()).html).toContain(`src="${origin}/embed.html`)
  })

  it('returns 404 for an unknown video URL', async () => {
    vi.mocked(fetchEvent).mockResolvedValue(null)
    const nevent = neventEncode({ id: 'a'.repeat(64), relays: [] })
    const response = await createApp().request(requestUrl(`${origin}/v/${nevent}`))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Event not found' })
  })

  it('returns 404 for a non-video URL', async () => {
    const naddr = naddrEncode({
      kind: 30004,
      pubkey: event.pubkey,
      identifier: 'playlist',
      relays: [],
    })
    const response = await createApp().request(requestUrl(`${origin}/playlist/${naddr}`))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Video URL not supported' })
    expect(fetchEvent).not.toHaveBeenCalled()
  })

  it('returns 404 for a URL that is not a video page', async () => {
    const response = await createApp().request(
      requestUrl(`${origin}/profile/${noteEncode('a'.repeat(64))}`)
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Video URL not supported' })
    expect(fetchEvent).not.toHaveBeenCalled()
  })

  it('returns 404 for a video page with an invalid identifier', async () => {
    const response = await createApp().request(requestUrl(`${origin}/v/not-a-nip19-identifier`))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Video URL not supported' })
    expect(fetchEvent).not.toHaveBeenCalled()
  })
})

describe('video page oEmbed discovery', () => {
  it('advertises the oEmbed endpoint on injected video pages', async () => {
    const nevent = neventEncode({
      id: event.id,
      relays: [],
      author: event.pubkey,
      kind: event.kind,
    })
    const response = await createApp().request(`${origin}/v/${nevent}`, {
      headers: { 'user-agent': 'facebookexternalhit' },
    })
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('<link rel="alternate" type="application/json+oembed"')
    expect(html).toContain(
      `href="${origin}/oembed?url=${encodeURIComponent(`${origin}/v/${nevent}`)}&amp;format=json"`
    )
  })

  it('uses HTTPS for canonical, player and discovery URLs behind a TLS proxy', async () => {
    const response = await createApp().request(`http://videos.example/v/${identifier}`, {
      headers: { 'X-Forwarded-Proto': 'https' },
    })
    const html = await response.text()
    expect(html).toContain(`content="${origin}/v/${identifier}"`)
    expect(html).toContain(`content="${origin}/embed.html?v=${identifier}"`)
    expect(html).toContain(`href="${origin}/oembed?`)
    expect(html).not.toContain('http://videos.example')
  })

  it('does not advertise oEmbed on playlist pages, which the endpoint rejects', async () => {
    vi.mocked(fetchEvent).mockResolvedValue({ ...event, kind: 30004 })
    const naddr = naddrEncode({ kind: 30004, pubkey: event.pubkey, identifier: 'playlist' })
    const response = await createApp().request(`${origin}/playlist/${naddr}`)
    const html = await response.text()

    expect(html).toContain('og:title')
    expect(html).not.toContain('application/json+oembed')
  })
})
