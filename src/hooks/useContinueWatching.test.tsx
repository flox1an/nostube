import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useContinueWatching } from './useContinueWatching'
import type { Event } from '@/utils/video-event'
import type { PlayPositionEntry } from '@/lib/play-position-db'

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { pubkey: 'viewer' } }),
}))

const historyEvents = vi.hoisted(() => ({
  current: [] as Array<{ eventId: string; event: Event }>,
}))
vi.mock('./useVideoHistory', () => ({
  useVideoHistory: () => ({ history: historyEvents.current }),
}))

const appConfig = vi.hoisted(() => ({ current: { nsfwFilter: 'hide' as string | undefined } }))
vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({ config: appConfig.current }),
}))

vi.mock('@/hooks/useSelectedPreset', () => ({
  useSelectedPreset: () => ({ presetContent: { nsfwPubkeys: [] } }),
}))

const positions = vi.hoisted(() => ({ current: [] as PlayPositionEntry[] }))
vi.mock('@/lib/play-position-db', async importOriginal => ({
  ...(await importOriginal<object>()),
  getRecentlyPlayedVideos: () => Promise.resolve(positions.current),
}))

function mockEvent(tags: string[][], id: string): Event {
  return {
    id,
    pubkey: 'd'.repeat(64),
    created_at: 1700000000,
    kind: 21,
    tags: [['imeta', 'url https://example.com/video.mp4', 'm video/mp4'], ...tags],
    content: '',
    sig: 'b'.repeat(128),
  }
}

const safeEvent = mockEvent([], 'a'.repeat(64))
const nsfwEvent = mockEvent([['content-warning', 'NSFW']], 'c'.repeat(64))

function position(videoId: string, lastPlayedAt: number): PlayPositionEntry {
  return {
    key: `viewer:${videoId}`,
    pubkey: 'viewer',
    videoId,
    time: 30,
    duration: 600,
    lastPlayedAt,
  }
}

function Wrapper({ children }: { children: ReactNode }) {
  return <>{children}</>
}

function setupHistory() {
  positions.current = [position(safeEvent.id, 1), position(nsfwEvent.id, 2)]
  historyEvents.current = [
    { eventId: safeEvent.id, event: safeEvent },
    { eventId: nsfwEvent.id, event: nsfwEvent },
  ]
}

afterEach(cleanup)

describe('useContinueWatching NSFW filter', () => {
  it('drops content-warning videos when nsfwFilter is hide', async () => {
    setupHistory()
    const { result } = renderHook(() => useContinueWatching(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.videos.length).toBe(1))
    expect(result.current.videos.map(v => v.id)).toEqual([safeEvent.id])
  })

  it('keeps content-warning videos when nsfwFilter is warning', async () => {
    setupHistory()
    appConfig.current.nsfwFilter = 'warning'
    const { result } = renderHook(() => useContinueWatching(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.videos.length).toBe(2))
    expect(result.current.videos.map(v => v.id)).toEqual([safeEvent.id, nsfwEvent.id])
    appConfig.current.nsfwFilter = 'hide'
  })
})
