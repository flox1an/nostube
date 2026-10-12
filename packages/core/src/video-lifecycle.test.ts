import { describe, expect, it } from 'vitest'
import type { NostrEvent } from 'nostr-tools'
import { buildVideoUpdate, buildVideoDeletion } from './video-lifecycle'

const author = 'a'.repeat(64)
const event: NostrEvent = {
  id: 'b'.repeat(64),
  pubkey: author,
  sig: 'c'.repeat(128),
  kind: 34235,
  created_at: 200,
  content: 'Old description',
  tags: [
    ['d', 'stable'],
    ['title', 'Old'],
    ['published_at', '100'],
    ['custom', 'keep'],
    [
      'imeta',
      'url https://media/old.mp4',
      'x oldhash',
      'size 123',
      'image https://media/thumb.jpg',
      'custom retained',
    ],
    ['text-track', 'https://media/en.vtt', 'en', 'captions'],
  ],
}
const metadata = { title: 'New', description: 'Updated', tags: ['new'] }

describe('video lifecycle', () => {
  it('edits metadata without changing video or unchanged assets, preserving unknown tags and publish date', () => {
    const update = buildVideoUpdate(event, author, metadata, 190)
    expect(update.kind).toBe(34235)
    expect(update.created_at).toBe(201)
    expect(update.content).toBe('Updated')
    expect(update.tags).toContainEqual(['d', 'stable'])
    expect(update.tags).toContainEqual(['published_at', '100'])
    expect(update.tags).toContainEqual(['custom', 'keep'])
    expect(update.tags).toContainEqual(event.tags[4])
    expect(update.tags).toContainEqual(event.tags[5])
  })

  it('retains the original date when a legacy event has no published_at tag', () => {
    const legacy = { ...event, tags: event.tags.filter(tag => tag[0] !== 'published_at') }
    expect(buildVideoUpdate(legacy, author, metadata, 300).tags).toContainEqual([
      'published_at',
      '200',
    ])
  })

  it('replaces media hash/size/dimensions without moving the address even for portrait replacement', () => {
    const update = buildVideoUpdate(
      event,
      author,
      {
        ...metadata,
        video: {
          url: 'https://media/new.mp4',
          sha256: 'newhash',
          size: 987,
          type: 'video/mp4',
          width: 720,
          height: 1280,
          duration: 42,
        },
      },
      300
    )
    expect(update.kind).toBe(34235)
    expect(update.tags).toContainEqual(['d', 'stable'])
    expect(update.tags.find(tag => tag[0] === 'imeta')).toEqual([
      'imeta',
      'url https://media/new.mp4',
      'm video/mp4',
      'x newhash',
      'size 987',
      'dim 720x1280',
      'duration 42',
      'image https://media/thumb.jpg',
    ])
    expect(update.tags).toContainEqual(event.tags[5])
    expect(update.tags).toContainEqual(['published_at', '100'])
  })

  it('changes/removes only explicitly selected thumbnail and subtitle assets', () => {
    const update = buildVideoUpdate(event, author, { ...metadata, thumbnail: null, subtitles: [] })
    expect(update.tags.find(tag => tag[0] === 'imeta')).toEqual([
      'imeta',
      'url https://media/old.mp4',
      'x oldhash',
      'size 123',
      'custom retained',
    ])
    expect(update.tags.some(tag => tag[0] === 'text-track')).toBe(false)
  })

  it('deletes the latest id and stable address, with a timestamp newer than the video', () => {
    expect(buildVideoDeletion(event, author, 199)).toEqual({
      kind: 5,
      created_at: 201,
      content: '',
      tags: [
        ['e', event.id],
        ['a', `34235:${author}:stable`],
        ['k', '34235'],
      ],
    })
  })

  it('refuses other authors, non-addressable videos and missing coordinates', () => {
    for (const invalid of [event, { ...event, kind: 21 }, { ...event, tags: [] }]) {
      const signer = invalid === event ? 'd'.repeat(64) : author
      expect(() => buildVideoUpdate(invalid, signer, metadata)).toThrow()
      expect(() => buildVideoDeletion(invalid, signer)).toThrow()
    }
  })
})
