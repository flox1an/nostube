import type { EventTemplate } from 'nostr-tools'

/** A blob as the Blossom server answered after the upload (its descriptor). */
export interface UploadedBlob {
  url: string
  sha256: string
  size: number
  type: string
}

export interface VideoPublishInput {
  /** The `d` tag: names this video among the creator's addressable events. */
  identifier: string
  title: string
  description: string
  /** Hashtags without the `#`. */
  tags: string[]
  /** A content warning's reason; undefined means there is none, an empty string the default. */
  contentWarning?: string
  video: UploadedBlob & { width: number; height: number; duration: number }
  thumbnail?: UploadedBlob
  /** Seconds; shown as the publish date. */
  publishedAt?: number
}

/** NIP-71 addressable kinds: 34236 for vertical videos (shorts), 34235 for all others. */
export function videoKindFor(width: number, height: number): 34235 | 34236 {
  return height > width ? 34236 : 34235
}

/** The video event to sign: `imeta` with the file, its hash and thumbnail, plus the usual tags. */
export function buildVideoEvent(input: VideoPublishInput): EventTemplate {
  const { video, thumbnail } = input
  const now = Math.floor(Date.now() / 1000)
  const imeta = [
    'imeta',
    `url ${video.url}`,
    `m ${video.type}`,
    `x ${video.sha256}`,
    `size ${video.size}`,
    `dim ${video.width}x${video.height}`,
    `duration ${Math.round(video.duration)}`,
    ...(thumbnail ? [`image ${thumbnail.url}`] : []),
  ]
  const description = input.description.trim()
  return {
    kind: videoKindFor(video.width, video.height),
    created_at: now,
    content: description,
    tags: [
      ['d', input.identifier],
      ['title', input.title.trim()],
      ['alt', description || input.title.trim()],
      ['published_at', String(input.publishedAt ?? now)],
      ['duration', String(Math.round(video.duration))],
      imeta,
      ...(input.contentWarning === undefined
        ? []
        : [['content-warning', input.contentWarning.trim() || 'NSFW']]),
      ...input.tags.map(tag => ['t', tag]),
      ['client', 'nostube-studio'],
    ],
  }
}
