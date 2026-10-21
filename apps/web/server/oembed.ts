import type { VideoMeta } from './meta.js'

export interface OEmbedResponse {
  version: '1.0'
  type: 'video'
  title: string
  author_name: string
  author_url: string
  provider_name: string
  provider_url: string
  thumbnail_url?: string
  html: string
  width: number
  height: number
  cache_age: number
}

/** Video oEmbed response (fixed 640x360 player), documented in docs/embed/oembed.md. */
export function buildOEmbed(meta: VideoMeta, embedUrl: string, pageUrl: string): OEmbedResponse {
  const providerUrl = new URL(pageUrl).origin
  return {
    version: '1.0',
    type: 'video',
    title: meta.title,
    author_name: meta.authorNpub,
    author_url: `${providerUrl}/p/${meta.authorNpub}`,
    provider_name: 'Nostube',
    provider_url: providerUrl,
    ...(meta.thumbnail ? { thumbnail_url: meta.thumbnail } : {}),
    html: `<iframe src="${embedUrl}" width="640" height="360" frameborder="0" allowfullscreen allow="autoplay; fullscreen"></iframe>`,
    width: 640,
    height: 360,
    cache_age: 600,
  }
}
