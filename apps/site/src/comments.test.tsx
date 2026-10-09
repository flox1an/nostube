import './i18n'
import { render, screen } from '@testing-library/react'
import { AccountManager } from 'applesauce-accounts'
import { PrivateKeyAccount } from 'applesauce-accounts/accounts'
import { EventStore } from 'applesauce-core'
import { AccountsProvider, EventStoreProvider } from 'applesauce-react/providers'
import { matchFilters, type Filter, type NostrEvent } from 'nostr-tools'
import { EMPTY, of } from 'rxjs'
import { expect, it } from 'vitest'
import type { NostubeClient } from '@nostube/core/client'
import { NostubeHostProvider, type NostubeHost } from '@nostube/widgets/host'
import { TimelineProvider, type TimelineContextValue } from '@nostube/widgets/timeline'
import { Comments } from './Comments'

it('shows the signed-in visitor in the comment input instead of a placeholder', async () => {
  const account = PrivateKeyAccount.generateNew()
  const manager = new AccountManager()
  manager.addAccount(account)
  manager.setActive(account)
  const store = new EventStore()
  store.verifyEvent = () => true
  store.add({
    kind: 0,
    content: JSON.stringify({ name: 'visitor' }),
    tags: [],
    id: 'b'.repeat(64),
    pubkey: account.pubkey,
    created_at: 1_700_000_000,
    sig: 'f'.repeat(128),
  } as NostrEvent)
  const pool = { request: () => EMPTY }
  const client = { requestVisitorIdentity: () => EMPTY } as unknown as NostubeClient
  const host = {
    pool,
    config: {},
    relays: { read: [], metadata: [], indexer: [], zap: [] },
  } as unknown as NostubeHost
  const timeline = { client, policy: {} } as unknown as TimelineContextValue

  render(
    <EventStoreProvider eventStore={store}>
      <NostubeHostProvider value={host}>
        <TimelineProvider value={timeline}>
          <AccountsProvider manager={manager}>
            <Comments
              target={{ videoId: 'a'.repeat(64), authorPubkey: 'c'.repeat(64) }}
              links={{} as never}
              relays={['wss://instance.example']}
              creators={[]}
            />
          </AccountsProvider>
        </TimelineProvider>
      </NostubeHostProvider>
    </EventStoreProvider>
  )

  expect(await screen.findByText('v')).toBeTruthy()
  expect(screen.queryByText('?')).toBeNull()
})

it('hides what any creator muted, by author or by comment, and does not count it', async () => {
  const [video, creatorA, creatorB, spammer, other, visitor] = 'abcdef'.split('')
  const videoId = video.repeat(64)
  const event = (id: string, pubkey: string, kind: number, content: string, tags: string[][]) =>
    ({
      id,
      pubkey,
      kind,
      content,
      tags,
      created_at: 1_700_000_000,
      sig: 'f'.repeat(128),
    }) as NostrEvent
  const comment = (id: string, pubkey: string, content: string, parent = videoId) =>
    event(id.repeat(64), pubkey.repeat(64), 1111, content, [
      ['E', videoId],
      ['e', parent],
    ])
  const events = [
    comment('1', visitor, 'kept comment'),
    comment('2', spammer, 'spam by author'),
    comment('3', other, 'muted single comment'),
    comment('4', spammer, 'spam reply', '1'.repeat(64)),
    comment('5', other, 'kept reply', '1'.repeat(64)),
    // Two creators, two lists: both apply.
    event('8'.repeat(64), creatorA.repeat(64), 10000, '', [['p', spammer.repeat(64)]]),
    event('9'.repeat(64), creatorB.repeat(64), 10000, '', [['e', '3'.repeat(64)]]),
  ]
  const store = new EventStore()
  store.verifyEvent = () => true
  const pool = {
    request: (_relays: string[], filters: Filter[]) =>
      of(...events.filter(e => matchFilters(filters, e))),
  }
  const host = {
    pool,
    config: {},
    relays: { read: [], metadata: [], indexer: [], zap: [] },
  } as unknown as NostubeHost
  const client = { requestVisitorIdentity: () => EMPTY } as unknown as NostubeClient

  render(
    <EventStoreProvider eventStore={store}>
      <NostubeHostProvider value={host}>
        <TimelineProvider value={{ client, policy: {} } as unknown as TimelineContextValue}>
          <AccountsProvider manager={new AccountManager()}>
            <Comments
              target={{ videoId, authorPubkey: creatorA.repeat(64) }}
              links={{} as never}
              relays={['wss://instance.example']}
              creators={[creatorA.repeat(64), creatorB.repeat(64)]}
            />
          </AccountsProvider>
        </TimelineProvider>
      </NostubeHostProvider>
    </EventStoreProvider>
  )

  expect(await screen.findByText('kept comment')).toBeTruthy()
  expect(screen.getByText('kept reply')).toBeTruthy()
  expect(screen.queryByText(/spam/)).toBeNull()
  expect(screen.queryByText('muted single comment')).toBeNull()
  expect(screen.getByText('1 comment')).toBeTruthy()
})
