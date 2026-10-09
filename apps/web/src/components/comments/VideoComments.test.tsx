import { act, cleanup, render, screen } from '@testing-library/react'
import { EventStore } from 'applesauce-core'
import { EventStoreProvider } from 'applesauce-react'
import { finalizeEvent } from 'nostr-tools'
import type { NostrEvent } from 'nostr-tools'
import { merge, Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoComments } from './VideoComments'
import type { Comment, VideoCommentsProps } from '@nostube/core/comments'

// Each pool.request() call records one Subject per relay so tests can drive
// relay responses (events / EOSE) independently.
const requests: Subject<NostrEvent>[][] = []
const pool = {
  request: () => {
    const sources = relays.map(() => new Subject<NostrEvent>())
    requests.push(sources)
    return merge(...sources)
  },
}

const relays = ['wss://fast.example', 'wss://slow.example']
const baseProps: VideoCommentsProps = {
  videoId: 'a'.repeat(64),
  authorPubkey: 'b'.repeat(64),
  link: '',
  relays,
}

vi.mock('@/hooks', () => ({
  useCurrentUser: () => ({}),
  useProfile: () => undefined,
  useNostrPublish: () => ({ publish: vi.fn() }),
  useAppContext: () => ({ pool, config: { relays: [] } }),
  useUserRelays: () => ({}),
  useReportedPubkeys: () => undefined,
}))
vi.mock('@/components/auth/AuthDialog', () => ({ AuthDialog: () => null }))
vi.mock('@nostube/widgets/components/CommentInput', () => ({ CommentInput: () => null }))
vi.mock('./CommentItem', () => ({
  CommentItem: ({ comment }: { comment: Comment }) => <p>{comment.content}</p>,
}))

let eventStore: EventStore

const renderComments = (props: VideoCommentsProps) =>
  render(
    <EventStoreProvider eventStore={eventStore}>
      <VideoComments {...props} />
    </EventStoreProvider>
  )

const commentFor = (videoId: string, content: string) =>
  finalizeEvent(
    { kind: 1, created_at: 1, tags: [['e', videoId]], content },
    new Uint8Array(32).fill(1)
  )

beforeEach(() => {
  requests.length = 0
  eventStore = new EventStore()
  // jsdom's TextEncoder realm breaks schnorr verification; not under test here.
  eventStore.verifyEvent = () => true
})
afterEach(cleanup)

describe('VideoComments loading', () => {
  it('shows the skeleton while requests are open', () => {
    const { container } = renderComments(baseProps)
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
    expect(requests).toHaveLength(1)
  })

  it('resolves to the empty state once relays finish without comments', () => {
    const { container } = renderComments(baseProps)
    act(() => requests[0].forEach(source => source.complete()))
    expect(container.querySelector('.animate-pulse')).toBeNull()
    expect(screen.getByText('Start the conversation.')).toBeInTheDocument()
  })

  it('renders comments from all relays and clears the skeleton at EOSE', () => {
    renderComments(baseProps)
    act(() => {
      requests[0][0].next(commentFor(baseProps.videoId, 'Fast relay comment'))
      requests[0][1].next(commentFor(baseProps.videoId, 'Slow relay comment'))
    })
    expect(screen.getByText('Fast relay comment')).toBeInTheDocument()
    expect(screen.getByText('Slow relay comment')).toBeInTheDocument()

    act(() => requests[0].forEach(source => source.complete()))
    expect(screen.getByText('Fast relay comment')).toBeInTheDocument()
    expect(screen.getByText('Slow relay comment')).toBeInTheDocument()
  })

  it('ignores the previous request after switching videos', () => {
    const { rerender, container } = renderComments(baseProps)
    const oldRequest = requests[0]
    const otherVideo = 'c'.repeat(64)
    rerender(
      <EventStoreProvider eventStore={eventStore}>
        <VideoComments {...baseProps} videoId={otherVideo} />
      </EventStoreProvider>
    )

    act(() => {
      oldRequest[0].next(commentFor(baseProps.videoId, 'Previous video comment'))
      oldRequest.forEach(source => source.complete())
    })
    expect(screen.queryByText('Previous video comment')).not.toBeInTheDocument()
    expect(container.querySelector('.animate-pulse')).not.toBeNull()

    act(() => requests[1].forEach(source => source.complete()))
    expect(container.querySelector('.animate-pulse')).toBeNull()
    expect(screen.getByText('Start the conversation.')).toBeInTheDocument()
  })
})
