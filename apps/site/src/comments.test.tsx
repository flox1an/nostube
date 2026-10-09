import './i18n'
import { render, screen } from '@testing-library/react'
import { AccountManager } from 'applesauce-accounts'
import { PrivateKeyAccount } from 'applesauce-accounts/accounts'
import { EventStore } from 'applesauce-core'
import { AccountsProvider, EventStoreProvider } from 'applesauce-react/providers'
import type { NostrEvent } from 'nostr-tools'
import { EMPTY } from 'rxjs'
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
            />
          </AccountsProvider>
        </TimelineProvider>
      </NostubeHostProvider>
    </EventStoreProvider>
  )

  expect(await screen.findByText('v')).toBeTruthy()
  expect(screen.queryByText('?')).toBeNull()
})
