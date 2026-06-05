import { act, renderHook, waitFor } from '@testing-library/react'
import { Subject } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NostrEvent } from 'nostr-tools'
import { useTimeline } from './useTimeline'

const mocks = vi.hoisted(() => ({
  addEvent: vi.fn(),
  timeline: vi.fn(),
  processEvents: vi.fn(),
  getPublishDate: vi.fn(),
  getTimelineLoader: vi.fn(),
}))

vi.mock('@/hooks/useReportedPubkeys', () => ({
  useReportedPubkeys: () => ({}),
}))

vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({
    config: {
      blossomServers: [],
      reportedEventIds: [],
      showYouTubeContent: true,
      showAudioContent: true,
    },
  }),
}))

vi.mock('@/hooks/useMissingVideos', () => ({
  useMissingVideos: () => ({
    getAllMissingVideos: () => ({}),
  }),
}))

vi.mock('@/hooks/useSelectedPreset', () => ({
  useSelectedPreset: () => ({
    presetContent: { nsfwPubkeys: [] },
  }),
}))

vi.mock('applesauce-react/hooks', () => ({
  useEventStore: () => ({
    add: mocks.addEvent,
    timeline: mocks.timeline,
  }),
  use$: (factory: () => { subscribe?: unknown }) => {
    factory()
    return []
  },
}))

vi.mock('./core', () => ({
  getTimelineLoader: (...args: unknown[]) => mocks.getTimelineLoader(...args),
}))

vi.mock('@/utils/video-event', () => ({
  processEvents: (...args: unknown[]) => mocks.processEvents(...args),
  getPublishDate: (...args: unknown[]) => mocks.getPublishDate(...args),
}))

function makeEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: 'event-id',
    pubkey: 'pubkey',
    kind: 34235,
    created_at: 100,
    content: '',
    tags: [],
    sig: 'sig',
    ...overrides,
  }
}

async function flushQueuedInitialLoad() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.processEvents.mockImplementation((events: NostrEvent[]) =>
      events.map(event => ({
        id: event.id,
        pubkey: event.pubkey,
        created_at: event.created_at,
      }))
    )
    mocks.getPublishDate.mockImplementation((video: { created_at: number }) => video.created_at)
  })

  it('stays idle when timeline loading is disabled', async () => {
    const timelineLoader = vi.fn(() => new Subject<NostrEvent>())
    const loader = vi.fn(() => timelineLoader)

    const { result } = renderHook(() =>
      useTimeline(undefined, {
        loader,
        directMode: true,
        enabled: false,
      })
    )

    await flushQueuedInitialLoad()

    expect(loader).not.toHaveBeenCalled()
    expect(timelineLoader).not.toHaveBeenCalled()
    expect(result.current.phase).toBe('idle')
    expect(result.current.loading).toBe(false)
    expect(result.current.hasMore).toBe(true)
  })

  it('loads direct events and exposes processed videos', async () => {
    const subjects: Subject<NostrEvent>[] = []
    const timelineLoader = vi.fn(() => {
      const subject = new Subject<NostrEvent>()
      subjects.push(subject)
      return subject
    })
    const loader = vi.fn(() => timelineLoader)

    const { result } = renderHook(() =>
      useTimeline(undefined, {
        loader,
        directMode: true,
        relays: ['wss://relay.example'],
        firstEventTimeoutMs: 100,
        firstUsefulTimeoutMs: 1,
        pageSettleMs: 10,
      })
    )

    await flushQueuedInitialLoad()

    expect(timelineLoader).toHaveBeenCalledWith(undefined)
    expect(result.current.phase).toBe('loading-initial')

    act(() => {
      subjects[0].next(makeEvent({ id: 'older', created_at: 10 }))
      subjects[0].next(makeEvent({ id: 'newer', created_at: 30 }))
      subjects[0].complete()
    })

    await waitFor(() => {
      expect(result.current.phase).toBe('ready')
    })

    expect(result.current.events.map(event => event.id)).toEqual(['newer', 'older'])
    expect(result.current.videos.map(video => video.id)).toEqual(['newer', 'older'])
    expect(mocks.processEvents).toHaveBeenLastCalledWith(
      result.current.events,
      ['wss://relay.example'],
      expect.objectContaining({
        includeAudio: true,
        includeYouTube: true,
      })
    )
  })

  it('loads the next page before the oldest current event', async () => {
    const subjects: Subject<NostrEvent>[] = []
    const timelineLoader = vi.fn(() => {
      const subject = new Subject<NostrEvent>()
      subjects.push(subject)
      return subject
    })
    const loader = vi.fn(() => timelineLoader)

    const { result } = renderHook(() =>
      useTimeline(undefined, {
        loader,
        directMode: true,
        firstEventTimeoutMs: 100,
        firstUsefulTimeoutMs: 1,
        pageSettleMs: 10,
      })
    )

    await flushQueuedInitialLoad()

    act(() => {
      subjects[0].next(makeEvent({ id: 'newer', created_at: 30 }))
      subjects[0].next(makeEvent({ id: 'older', created_at: 10 }))
      subjects[0].complete()
    })

    await waitFor(() => {
      expect(result.current.phase).toBe('ready')
    })

    act(() => {
      result.current.loadMore()
    })

    expect(timelineLoader).toHaveBeenLastCalledWith({ until: 9 })
  })
})
