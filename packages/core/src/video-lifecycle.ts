import type { EventTemplate, NostrEvent } from 'nostr-tools'
import type { VideoPublishInput } from './video-publish'

export interface VideoUpdateInput {
  title: string
  description: string
  tags: string[]
  contentWarning?: string
  /** Undefined preserves the existing thumbnail; null removes it. */
  thumbnail?: string | null
  /** Undefined preserves all existing subtitle tags, including their additional fields. */
  subtitles?: { url: string; lang: string; extra?: string[] }[]
  video?: VideoPublishInput['video']
}

function assertOwner(event: NostrEvent, pubkey: string): string {
  if (event.pubkey !== pubkey) throw new Error('authorMismatch')
  if (event.kind !== 34235 && event.kind !== 34236) throw new Error('notAddressable')
  const identifier = event.tags.find(tag => tag[0] === 'd')?.[1]
  if (identifier === undefined) throw new Error('notAddressable')
  return identifier
}

/** Replace one coordinate, never deriving its kind from a replacement file's orientation. */
export function buildVideoUpdate(
  event: NostrEvent,
  pubkey: string,
  input: VideoUpdateInput,
  now = Math.floor(Date.now() / 1000)
): EventTemplate {
  assertOwner(event, pubkey)
  const replaced = new Set(['title', 'alt', 't', 'content-warning'])
  if (input.subtitles !== undefined) replaced.add('text-track')
  if (input.thumbnail !== undefined) {
    replaced.add('image')
    replaced.add('thumb')
  }
  if (input.video) {
    replaced.add('imeta')
    replaced.add('duration')
    // Legacy media tags must not continue pointing at the old video.
    for (const key of ['url', 'x', 'm', 'size', 'dim']) replaced.add(key)
  }
  const tags = event.tags.filter(tag => !replaced.has(tag[0])).map(tag => [...tag])
  if (!tags.some(tag => tag[0] === 'published_at'))
    tags.push(['published_at', String(event.created_at)])
  if (input.thumbnail !== undefined && !input.video) {
    for (let i = 0; i < tags.length; i++) {
      if (tags[i][0] !== 'imeta') continue
      tags[i] = tags[i].filter(field => !field.startsWith('image '))
      if (input.thumbnail) tags[i].push(`image ${input.thumbnail}`)
    }
  }
  const title = input.title.trim()
  const description = input.description.trim()
  tags.push(['title', title], ['alt', description || title], ...input.tags.map(tag => ['t', tag]))
  if (input.contentWarning !== undefined)
    tags.push(['content-warning', input.contentWarning.trim() || 'NSFW'])
  if (input.video) {
    const video = input.video
    const oldImage =
      event.tags
        .flatMap(tag => (tag[0] === 'imeta' ? tag.slice(1) : []))
        .find(field => field.startsWith('image '))
        ?.slice(6) ?? event.tags.find(tag => tag[0] === 'image' || tag[0] === 'thumb')?.[1]
    const thumbnail = input.thumbnail === undefined ? oldImage : input.thumbnail
    tags.push(
      ['duration', String(Math.round(video.duration))],
      [
        'imeta',
        `url ${video.url}`,
        `m ${video.type}`,
        `x ${video.sha256}`,
        `size ${video.size}`,
        `dim ${video.width}x${video.height}`,
        `duration ${Math.round(video.duration)}`,
        ...(thumbnail ? [`image ${thumbnail}`] : []),
      ]
    )
  } else if (input.thumbnail && !tags.some(tag => tag[0] === 'imeta')) {
    tags.push(['image', input.thumbnail])
  }
  if (input.subtitles !== undefined) {
    tags.push(
      ...input.subtitles.map(track => ['text-track', track.url, track.lang, ...(track.extra ?? [])])
    )
  }
  return {
    kind: event.kind,
    created_at: Math.max(now, event.created_at + 1),
    content: description,
    tags,
  }
}

/** NIP-09 requests both latest event-id deletion and deletion of its addressable coordinate. */
export function buildVideoDeletion(
  event: NostrEvent,
  pubkey: string,
  now = Math.floor(Date.now() / 1000)
): EventTemplate {
  const identifier = assertOwner(event, pubkey)
  return {
    kind: 5,
    created_at: Math.max(now, event.created_at + 1),
    content: '',
    tags: [
      ['e', event.id],
      ['a', `${event.kind}:${event.pubkey}:${identifier}`],
      ['k', String(event.kind)],
    ],
  }
}
