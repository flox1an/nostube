import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { addSeenRelay } from 'applesauce-core/helpers/relays'
import { nip19, type NostrEvent } from 'nostr-tools'
import { processEvent } from '@nostube/core/video-event'
import { VideoCard } from '@/components/VideoCard'
import { useVideoHistory } from './useVideoHistory'
import { useContinueWatching } from './useContinueWatching'

vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { pubkey: 'viewer' } }),
}))
vi.mock('@/hooks/useAppContext', () => ({ useAppContext: () => ({ config: {} }) }))
vi.mock('@/hooks/useSelectedPreset', () => ({
  useSelectedPreset: () => ({ presetContent: { nsfwPubkeys: [] } }),
}))
vi.mock('@/lib/play-position-db', () => ({
  getRecentlyPlayedVideos: () =>
    Promise.resolve([{ videoId: 'a'.repeat(64), time: 30, duration: 600 }]),
}))
vi.mock('@nostube/widgets/hooks/useProfile', () => ({ useProfile: () => undefined }))
vi.mock('applesauce-react/hooks', () => ({
  useEventStore: () => ({ getEvent: () => undefined }),
}))
vi.mock('@/hooks', () => ({ useAppContext: () => ({ config: {} }) }))
vi.mock('@/desktop/useDesktopWindowCoordinator', () => ({
  useDesktopWindowCoordinator: () => undefined,
}))
vi.mock('@/components/PlayProgressBar', () => ({ PlayProgressBar: () => null }))
vi.mock('@/components/UserActionsMenu', () => ({ UserActionsMenu: () => null }))

const privateRelay = 'wss://private.example'
const otherRelay = 'wss://other.example'
const event: NostrEvent = {
  id: 'a'.repeat(64),
  pubkey: 'b'.repeat(64),
  kind: 21,
  created_at: 1700000000,
  tags: [['imeta', 'url https://example.com/video.mp4', 'm video/mp4']],
  content: 'Private video',
  sig: 'c'.repeat(128),
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('watch history relay hints', () => {
  it('resumes a locally persisted video from its private relay after remounting', async () => {
    const seenEvent = structuredClone(event)
    addSeenRelay(seenEvent, privateRelay)
    const history = renderHook(() => useVideoHistory())
    act(() => history.result.current.addToHistory(seenEvent))
    history.unmount()

    const resumed = renderHook(() => useContinueWatching())
    await waitFor(() => expect(resumed.result.current.videos).toHaveLength(1))
    expect(nip19.decode(resumed.result.current.videos[0].link)).toMatchObject({
      type: 'nevent',
      data: { id: event.id, author: event.pubkey, relays: [privateRelay] },
    })
  })

  it('keeps known hints when revisiting without them and merges new hints without duplicates', () => {
    const history = renderHook(() => useVideoHistory())
    act(() => history.result.current.addToHistory(event, [privateRelay, privateRelay]))
    act(() => history.result.current.addToHistory(event))
    act(() => history.result.current.addToHistory(event, [otherRelay, privateRelay]))
    history.unmount()

    const restored = renderHook(() => useVideoHistory())
    expect(restored.result.current.history).toHaveLength(1)
    const entry = restored.result.current.history[0]
    const video = processEvent(entry.event, entry.relays ?? [])!
    expect(nip19.decode(video.link)).toMatchObject({
      data: { relays: expect.arrayContaining([privateRelay, otherRelay]) },
    })
    expect(entry.relays).toHaveLength(2)
  })

  it('links the author to the private relay without an event-store cache entry', () => {
    const video = processEvent(event, [privateRelay])!
    const { container } = render(
      <MemoryRouter>
        <VideoCard video={video} format="horizontal" />
      </MemoryRouter>
    )
    const authorLink = container.querySelector<HTMLAnchorElement>('a[href^="/p/"]')!
    expect(nip19.decode(authorLink.getAttribute('href')!.slice(3))).toMatchObject({
      type: 'nprofile',
      data: { pubkey: event.pubkey, relays: [privateRelay] },
    })
  })

  it('still resumes legacy history without relay hints', async () => {
    localStorage.setItem(
      'video-history',
      JSON.stringify([{ eventId: event.id, timestamp: Date.now(), event }])
    )
    const resumed = renderHook(() => useContinueWatching())
    await waitFor(() => expect(resumed.result.current.videos).toHaveLength(1))
    expect(nip19.decode(resumed.result.current.videos[0].link)).toMatchObject({
      data: { id: event.id, relays: [] },
    })
  })
})
