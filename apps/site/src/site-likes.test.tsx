import './i18n'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EventStore } from 'applesauce-core'
import { AccountManager } from 'applesauce-accounts'
import { PrivateKeyAccount } from 'applesauce-accounts/accounts'
import { AccountsProvider, EventStoreProvider } from 'applesauce-react/providers'
import { finalizeEvent, matchFilter, verifyEvent, type Filter, type NostrEvent } from 'nostr-tools'
import { of } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import type { VideoEvent } from '@nostube/core/video-event'
import { NostubeHostProvider, type NostubeHost } from '@nostube/widgets/host'
import { isVideoLike, SiteLikes } from './SiteLikes'

const creator = 'c'.repeat(64)
const relays = ['wss://interact.example']
const video = {
  id: 'e'.repeat(64),
  kind: 34235,
  pubkey: creator,
  identifier: 'clip-1',
} as VideoEvent
const address = `34235:${creator}:clip-1`

let serial = 0
function event(pubkey: string, kind: number, content: string, tags: string[][]): NostrEvent {
  serial += 1
  return {
    id: serial.toString(16).padStart(64, '0'),
    pubkey: pubkey.repeat(64),
    kind,
    content,
    tags,
    created_at: 1_700_000_000 + serial,
    sig: '0'.repeat(128),
  }
}

type Publish = (relays: string[], event: NostrEvent) => Promise<unknown[]>

function renderLikes(events: NostrEvent[], publish: Publish, account?: PrivateKeyAccount) {
  const store = new EventStore()
  store.verifyEvent = () => true
  const pool = {
    request: (_relays: string[], filters: Filter[]) =>
      of(...events.filter(e => filters.some(f => matchFilter(f, e)))),
    publish: vi.fn(publish),
  }
  const manager = new AccountManager()
  if (account) {
    manager.addAccount(account)
    manager.setActive(account)
  }
  const host = { pool, config: {}, relays: {} } as unknown as NostubeHost
  render(
    <EventStoreProvider eventStore={store}>
      <NostubeHostProvider value={host}>
        <AccountsProvider manager={manager}>
          <SiteLikes video={video} relays={relays} />
        </AccountsProvider>
      </NostubeHostProvider>
    </EventStoreProvider>
  )
  return pool.publish
}

describe('SiteLikes', () => {
  it('counts each visitor’s like of this video once, by e or exact address, minus deletions', async () => {
    const tags = [
      ['e', video.id],
      ['p', creator],
      ['k', '34235'],
    ]
    const deleted = event('7', 7, '+', tags)
    const alicesLike = event('a', 7, '+', tags)
    const events = [
      alicesLike,
      event('a', 7, '+', tags), // a second like from the same visitor
      event('b', 7, '', [['a', address]]), // empty content is a like too
      event('d', 7, '-', tags),
      event('f', 7, '🔥', tags),
      // A like of a comment that also tags the video.
      event('9', 7, '+', [
        ['e', video.id],
        ['e', '1'.repeat(64)],
        ['k', '1111'],
      ]),
      deleted,
      event('7', 5, '', [['e', deleted.id]]),
      // Someone else cannot delete Alice's like.
      event('8', 5, '', [['e', alicesLike.id]]),
    ]
    const publish = renderLikes(events, async () => [])

    const button = await screen.findByRole('button', { name: 'Like (2 likes)' })
    expect(button.getAttribute('aria-pressed')).toBe('false')

    // A guest is asked to sign in instead of publishing.
    fireEvent.click(button)
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(publish).not.toHaveBeenCalled()
  })

  it('only matches the exact address and the video author', () => {
    expect(isVideoLike(event('a', 7, '+', [['a', address]]), video)).toBe(true)
    expect(isVideoLike(event('a', 7, '+', [['a', `${address}-2`]]), video)).toBe(false)
    expect(
      isVideoLike(
        event('a', 7, '+', [
          ['e', video.id],
          ['p', 'd'.repeat(64)],
        ]),
        video
      )
    ).toBe(false)
  })

  it('publishes a signed like to the instance relays, keeps a refusal retryable, and sends once', async () => {
    const account = PrivateKeyAccount.generateNew()
    // Use the same signer seam as NIP-07, with real signatures from nostr-tools.
    vi.spyOn(account.signer, 'signEvent').mockImplementation(async template =>
      finalizeEvent(template, Uint8Array.from(account.signer.key))
    )
    let accept: (results: unknown[]) => void = () => {}
    const publish = renderLikes(
      [],
      vi
        .fn<Publish>()
        .mockResolvedValueOnce([{ ok: false, from: relays[0], message: 'blocked: spam' }])
        .mockImplementationOnce(() => new Promise(resolve => (accept = resolve))),
      account
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Like (0 likes)' }))
    expect((await screen.findByRole('alert')).textContent).toContain('blocked: spam')
    const [sentTo, like] = publish.mock.calls[0]
    expect(sentTo).toEqual(relays)
    expect(like).toMatchObject({ kind: 7, content: '+', pubkey: account.pubkey })
    expect(verifyEvent(like)).toBe(true)
    expect(like.tags).toEqual(
      expect.arrayContaining([
        ['a', address],
        ['e', video.id],
        ['p', creator],
        ['k', '34235'],
      ])
    )
    const retry = screen.getByRole('button', { name: 'Like (0 likes)' })
    expect(retry.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(retry)
    fireEvent.click(retry)
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Liking…' }))
    accept([{ ok: true, from: relays[0] }])

    const liked = await screen.findByRole('button', { name: 'Like (1 like)' })
    expect(liked.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(publish).toHaveBeenCalledTimes(2)
  })
})
