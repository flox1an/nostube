import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { EventStore } from 'applesauce-core'
import { EventStoreProvider } from 'applesauce-react'
import { finalizeEvent, getPublicKey } from 'nostr-tools'
import { of, throwError } from 'rxjs'
import i18n from '@/i18n/config'
import { getTimelineLoader } from '@/nostr/core'
import { VideoReactionButtons } from './VideoReactionButtons'

const publish = vi.hoisted(() => vi.fn())

vi.mock('@/nostr/core', () => ({ getTimelineLoader: vi.fn() }))
vi.mock('@/hooks', async () => ({
  ...(await vi.importActual('@/hooks/useDialogState')),
  useCurrentUser: () => ({ user: { pubkey: 'viewer' } }),
  useNostrPublish: () => ({ publish, isPending: false }),
  useEventStats: () => ({ upvoteCount: 0, downvoteCount: 0, reactions: [] }),
  useUserReactionStatus: () => ({ hasUpvoted: false, hasDownvoted: false }),
  useProfile: () => ({}),
}))
vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({ config: { relays: [{ url: 'wss://mine.example', tags: ['write'] }] } }),
}))
vi.mock('./ZapButton', () => ({ ZapButton: () => null }))
vi.mock('./ReactionsDialog', () => ({ ReactionsDialog: () => null }))
vi.mock('./auth/AuthDialog', () => ({ AuthDialog: () => null }))

const secret = new Uint8Array(32).fill(7)
const author = getPublicKey(secret)
const relayList = finalizeEvent(
  { kind: 10002, created_at: 1, tags: [['r', 'wss://inbox.example', 'read']], content: '' },
  secret
)
const loader = vi.mocked(getTimelineLoader)

const renderButtons = () => {
  const eventStore = new EventStore()
  // jsdom's TextEncoder realm breaks schnorr verification; not under test here.
  eventStore.verifyEvent = () => true
  return render(
    <I18nextProvider i18n={i18n}>
      <EventStoreProvider eventStore={eventStore}>
        <VideoReactionButtons eventId="video" kind={1} authorPubkey={author} />
      </EventStoreProvider>
    </I18nextProvider>
  )
}

describe('author relay discovery for interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    publish.mockResolvedValue(relayList)
  })

  it('skips the lookup while browsing and routes the first reaction to the author relays', async () => {
    loader.mockReturnValue(() => of(relayList))
    renderButtons()
    expect(loader).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Upvote, 0 reactions' }))
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1))
    expect(loader).toHaveBeenCalledTimes(1)
    expect(loader.mock.calls[0][1]).toEqual({ kinds: [10002], authors: [author], limit: 1 })
    expect(publish.mock.calls[0][0].relays).toEqual(['wss://inbox.example', 'wss://mine.example'])
  })

  it('still publishes to the write relays when the lookup fails', async () => {
    loader.mockReturnValue(() => throwError(() => new Error('relays down')))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    renderButtons()

    fireEvent.click(screen.getByRole('button', { name: 'Upvote, 0 reactions' }))
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1))
    expect(publish.mock.calls[0][0].relays).toEqual(['wss://mine.example'])
  })
})
