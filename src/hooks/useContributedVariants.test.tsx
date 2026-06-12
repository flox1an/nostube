import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NostrEvent } from 'nostr-tools'
import { useContributedVariants } from './useContributedVariants'
import type { VideoEvent } from '@/utils/video-event'

const relayEvents: NostrEvent[] = []
const fetchMock = vi.fn()

beforeEach(() => {
  relayEvents.splice(0, relayEvents.length)
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, status: 200 })
  vi.stubGlobal('fetch', fetchMock)
})

const mockRelays = [{ url: 'wss://relay.example.com' }]

vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({
    config: { relays: mockRelays },
  }),
}))

vi.mock('@/constants/relays', () => ({
  INDEXER_RELAYS: [],
}))

vi.mock('@/nostr/core', () => ({
  relayPool: {
    subscription: vi.fn(() => ({
      pipe: vi.fn(() => ({
        subscribe: vi.fn(({ next }: { next: (event: NostrEvent) => void }) => {
          for (const event of relayEvents) next(event)
          return { unsubscribe: vi.fn() }
        }),
      })),
    })),
  },
}))

const nostrEvent = (hash: string, url: string, pubkey: string): NostrEvent =>
  ({
    id: hash,
    pubkey,
    created_at: 1,
    kind: 1063,
    content: '',
    sig: `${hash}-sig`,
    tags: [
      ['url', url],
      ['x', hash],
      ['dim', '854x480'],
      ['m', 'video/mp4'],
    ],
  }) as NostrEvent

const video: VideoEvent = {
  id: 'video-id',
  kind: 34235,
  identifier: 'video-identifier',
  title: 'Video',
  description: '',
  images: [],
  pubkey: 'author-pubkey',
  created_at: 1,
  duration: 0,
  tags: [],
  searchText: '',
  urls: ['https://cdn.example.com/source.mp4'],
  mimeType: 'video/mp4',
  mediaType: 'video',
  dimensions: '1920x1080',
  size: 1,
  link: 'naddr1video',
  type: 'videos',
  textTracks: [],
  contentWarning: undefined,
  x: 'source-hash',
  origins: [],
  videoVariants: [],
  thumbnailVariants: [],
}

describe('useContributedVariants', () => {
  it('ignores 1063 mirror announcements with the source video hash', async () => {
    relayEvents.splice(
      0,
      relayEvents.length,
      nostrEvent('source-hash', 'https://mirror.example.com/source.mp4', 'mirror-pubkey'),
      nostrEvent('variant-hash', 'https://cdn.example.com/variant-480.mp4', 'variant-pubkey')
    )

    const { result } = renderHook(() => useContributedVariants(video))

    await waitFor(() => expect(result.current.variants).toHaveLength(1))
    expect(result.current.variants[0]).toMatchObject({
      quality: '480p',
      contributorPubkey: 'variant-pubkey',
    })
  })

  it('ignores 1063 variant announcements when no announced URL exists', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 })
    relayEvents.push(
      nostrEvent(
        'missing-variant-hash',
        'https://missing.example.com/variant-480.mp4',
        'variant-pubkey'
      )
    )

    const { result } = renderHook(() => useContributedVariants(video))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(result.current.variants).toEqual([])
  })

  it('exposes debug metadata for accepted and unavailable 1063 announcements', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 404 })
    relayEvents.push(
      nostrEvent('accepted-hash', 'https://cdn.example.com/accepted-480.mp4', 'accepted-pubkey'),
      nostrEvent('missing-hash', 'https://missing.example.com/missing-480.mp4', 'missing-pubkey')
    )

    const { result } = renderHook(() => useContributedVariants(video))

    await waitFor(() =>
      expect(result.current.debugRecords.map(record => record.status)).toEqual([
        'accepted',
        'unavailable',
      ])
    )
    expect(result.current.debugRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: 'accepted-hash',
          eventKind: 1063,
          pubkey: 'accepted-pubkey',
          hash: 'accepted-hash',
          url: 'https://cdn.example.com/accepted-480.mp4',
          status: 'accepted',
          reachableUrl: 'https://cdn.example.com/accepted-480.mp4',
        }),
        expect.objectContaining({
          eventId: 'missing-hash',
          eventKind: 1063,
          pubkey: 'missing-pubkey',
          hash: 'missing-hash',
          url: 'https://missing.example.com/missing-480.mp4',
          status: 'unavailable',
          statusCode: 404,
        }),
      ])
    )
  })
})
