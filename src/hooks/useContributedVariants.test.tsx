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

const nostrEvent = (
  hash: string,
  url: string,
  pubkey: string,
  overrides: { mime?: string; dim?: string | null } = {}
): NostrEvent => {
  const tags: string[][] = [
    ['url', url],
    ['x', hash],
    ['m', overrides.mime ?? 'video/mp4'],
  ]
  if (overrides.dim !== null) {
    tags.push(['dim', overrides.dim ?? '854x480'])
  }
  return {
    id: hash,
    pubkey,
    created_at: 1,
    kind: 1063,
    content: '',
    sig: `${hash}-sig`,
    tags,
  } as NostrEvent
}

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
  it('drops 1063 announcements that mirror the source video hash', async () => {
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
    // The mirror announcement must not surface in the debug section at all —
    // it announces media already referenced by the source event.
    expect(result.current.debugRecords.map(record => record.eventId)).not.toContain('source-hash')
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
          mediaType: 'video',
          reachableUrl: 'https://cdn.example.com/accepted-480.mp4',
        }),
        expect.objectContaining({
          eventId: 'missing-hash',
          eventKind: 1063,
          pubkey: 'missing-pubkey',
          hash: 'missing-hash',
          url: 'https://missing.example.com/missing-480.mp4',
          status: 'unavailable',
          mediaType: 'video',
          statusCode: 404,
        }),
      ])
    )
  })

  it('drops 1063 announcements that re-publish a thumbnail or subtitle already in the event', async () => {
    const thumbHash = 'a'.repeat(64)
    const subtitleHash = 'b'.repeat(64)
    const newVariantHash = 'c'.repeat(64)
    const videoWithMedia: VideoEvent = {
      ...video,
      images: [`https://blossom.primal.net/${thumbHash}.jpg`],
      textTracks: [{ url: `https://example.com/${subtitleHash}.vtt`, lang: 'en' }],
      thumbnailVariants: [
        {
          url: `https://almond.example.com/${thumbHash}.jpg`,
          fallbackUrls: [`https://blossom.primal.net/${thumbHash}.jpg`],
          mimeType: 'image/jpeg',
          mediaType: 'image',
        },
      ],
    }
    relayEvents.splice(
      0,
      relayEvents.length,
      // Mirror of thumbnail already referenced from the original event's imeta `image` URLs.
      nostrEvent(thumbHash, `https://blossom.primal.net/${thumbHash}.jpg`, 'echo-pubkey', {
        mime: 'image/jpeg',
        dim: null,
      }),
      // Mirror of subtitle already referenced from the original event's text-track URL.
      nostrEvent(subtitleHash, `https://blossom.primal.net/${subtitleHash}.vtt`, 'echo-pubkey', {
        mime: 'text/vtt',
        dim: null,
      }),
      // Genuine new video variant contribution.
      nostrEvent(newVariantHash, `https://cdn.example.com/${newVariantHash}.mp4`, 'newcomer')
    )

    const { result } = renderHook(() => useContributedVariants(videoWithMedia))

    await waitFor(() => expect(result.current.variants).toHaveLength(1))
    expect(result.current.variants[0]?.hash).toBe(newVariantHash)
    // Only the newcomer should show up in the debug section.
    expect(result.current.debugRecords).toHaveLength(1)
    expect(result.current.debugRecords[0]).toMatchObject({
      hash: newVariantHash,
      status: 'accepted',
      mediaType: 'video',
    })
  })

  it('records contributed thumbnails and subtitles but keeps them out of playable variants', async () => {
    const thumbHash = 'd'.repeat(64)
    const subtitleHash = 'e'.repeat(64)
    relayEvents.splice(
      0,
      relayEvents.length,
      nostrEvent(thumbHash, `https://cdn.example.com/${thumbHash}.jpg`, 'thumb-pubkey', {
        mime: 'image/jpeg',
        dim: null,
      }),
      nostrEvent(subtitleHash, `https://cdn.example.com/${subtitleHash}.vtt`, 'sub-pubkey', {
        mime: 'text/vtt',
        dim: null,
      })
    )

    const { result } = renderHook(() => useContributedVariants(video))

    await waitFor(() =>
      expect(
        result.current.debugRecords.filter(record => record.status === 'accepted')
      ).toHaveLength(2)
    )
    expect(result.current.variants).toEqual([])
    const byHash = Object.fromEntries(
      result.current.debugRecords.map(record => [record.hash, record.mediaType])
    )
    expect(byHash[thumbHash]).toBe('image')
    expect(byHash[subtitleHash]).toBe('subtitle')
  })
})
