import type { VideoMeta } from './meta'

export interface OEmbedResponse {
  version: '1.0'
  type: 'video' | 'rich'
  title: string
  author_name: string
  author_url: string
  provider_name: string
  provider_url: string
  thumbnail_url?: string
  html: string
  width: number
  height: number
}

export function buildOEmbed(
  meta: VideoMeta,
  embedUrl: string,
  baseUrl: string,
  type: 'video' | 'short' | 'playlist'
): OEmbedResponse {
  const width = meta.width || 1280
  const height = meta.height || 720

  const html =
    type === 'playlist'
      ? `<a href="${baseUrl}">${meta.title}</a>`
      : `<iframe src="${embedUrl}" width="${width}" height="${height}" frameborder="0" allowfullscreen></iframe>`

  return {
    version: '1.0',
    type: type === 'playlist' ? 'rich' : 'video',
    title: meta.title,
    author_name: meta.authorNpub.slice(0, 16) + '...',
    author_url: `${new URL(baseUrl).origin}/p/${meta.authorNpub}`,
    provider_name: 'NosTube',
    provider_url: new URL(baseUrl).origin,
    ...(meta.thumbnail ? { thumbnail_url: meta.thumbnail } : {}),
    html,
    width,
    height,
  }
}
