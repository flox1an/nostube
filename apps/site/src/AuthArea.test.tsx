import './i18n'
import { render, screen } from '@testing-library/react'
import { AccountManager } from 'applesauce-accounts'
import { PrivateKeyAccount } from 'applesauce-accounts/accounts'
import { EventStore } from 'applesauce-core'
import { filterDuplicateEvents } from 'applesauce-core/observable'
import type { NostubeClient } from '@nostube/core/client'
import { AccountsProvider, EventStoreProvider } from 'applesauce-react/providers'
import { matchFilters, type Filter, type NostrEvent } from 'nostr-tools'
import { of } from 'rxjs'
import { expect, it } from 'vitest'
import { NostubeHostProvider, type NostubeHost } from '@nostube/widgets/host'
import { AuthArea } from './AuthArea'

it('loads the signed-in visitor profile from their NIP-65 write relay without using read-only relays', async () => {
  const account = PrivateKeyAccount.generateNew()
  const manager = new AccountManager()
  manager.addAccount(account)
  manager.setActive(account)
  const store = new EventStore()
  store.verifyEvent = () => true
  const event = (kind: number, content: string, tags: string[][], id: string): NostrEvent => ({
    kind,
    content,
    tags,
    id: id.repeat(64),
    pubkey: account.pubkey,
    created_at: 1_700_000_000,
    sig: 'f'.repeat(128),
  })
  const list = event(
    10002,
    '',
    [
      ['r', 'wss://personal.test', 'write'],
      ['r', 'wss://read-only.test', 'read'],
    ],
    'a'
  )
  const profile = event(
    0,
    JSON.stringify({
      name: 'visitor',
      display_name: 'Visitor Display',
      picture: 'https://media.example/visitor.jpg',
    }),
    [],
    'b'
  )
  const unrelated = event(0, JSON.stringify({ name: 'Wrong Profile' }), [], 'c')
  const pool = {
    request: (relays: string[], filters: Filter[]) => {
      const hosts = relays.map(relay => new URL(relay).hostname)
      return of(
        ...[
          ...(hosts.includes('purplepag.es') ? [list] : []),
          ...(hosts.includes('personal.test') ? [profile] : []),
          ...(hosts.includes('read-only.test') ? [unrelated] : []),
        ].filter(e => matchFilters(filters, e))
      )
    },
  }
  const client = {
    requestVisitorIdentity: (pubkey: string, relays: string[]) =>
      pool
        .request(relays, [{ kinds: [0, 10002], authors: [pubkey] }])
        .pipe(filterDuplicateEvents(store)),
  } as unknown as NostubeClient
  const host = {
    pool,
    config: {},
    relays: {
      read: ['wss://instance.example'],
      metadata: ['wss://instance.example'],
      indexer: ['wss://instance.example'],
      zap: ['wss://instance.example'],
    },
  } as unknown as NostubeHost
  render(
    <EventStoreProvider eventStore={store}>
      <NostubeHostProvider value={host}>
        <AccountsProvider manager={manager}>
          <AuthArea client={client} relays={['wss://instance.example']} />
        </AccountsProvider>
      </NostubeHostProvider>
    </EventStoreProvider>
  )
  expect(await screen.findByText('Visitor Display')).toBeTruthy()
  expect(screen.queryByText('Wrong Profile')).toBeNull()
})
