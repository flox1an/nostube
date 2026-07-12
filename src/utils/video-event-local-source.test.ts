import { describe, expect, it } from 'vitest'
import { processEvent, type Event } from './video-event'

const hash = '161734deb1ac5581dd33f5552b65370b0a78ec7198d7c41b7e1fdddc34b1c550'

const localSourceEvent: Event = {
  id: '79f88f17176997562a15971f6ff6c295d43eef8eba36096a11342cb3f87d5821',
  pubkey: '05477569076bceead5dfe2ad6e0c854c630eaaa3ca2d0ee96e3a10816093b041',
  created_at: 1783739854,
  kind: 34235,
  content: '',
  sig: 'signature',
  tags: [
    ['d', '671108cd-28d6-4e85-b03c-af6b4642e5ba'],
    ['title', 'Sleep Token - The Summoning'],
    [
      'imeta',
      `url http://127.0.0.1:3000/${hash}.mp4`,
      'm video/mp4',
      `x ${hash}`,
      'image http://127.0.0.1:3000/thumbnail.jpeg',
    ],
  ],
}

describe('processEvent with a local NIP-71 source', () => {
  it('retains its hash for discovery without exposing local media URLs', () => {
    const video = processEvent(localSourceEvent, [])

    expect(video).toMatchObject({
      x: hash,
      mediaSourceStatus: 'requires-hash-resolution',
      blockedEventMediaUrlCount: 2,
      urls: [],
      images: [],
      videoVariants: [],
      thumbnailVariants: [],
    })
    expect(video?.sourceUrls).toEqual([`http://127.0.0.1:3000/${hash}.mp4`])
  })
})
