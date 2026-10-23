import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import { matchFilters, verifyEvent, type Filter, type NostrEvent } from 'nostr-tools'
import { NEVER, ReplaySubject, distinct, filter, merge } from 'rxjs'
import { AccountsContext } from 'applesauce-react'
import { AccountManager } from 'applesauce-accounts'
import { NostrConnectProvider, NostrConnectSigner, PrivateKeySigner } from 'applesauce-signers'
import { parseNostrConnectURI } from 'applesauce-signers/helpers'
import {
  isRelayAllowed,
  setInstanceConfig,
  type InstanceConfig,
} from '@nostube/core/instance-config'
import {
  loadAccountsFromStorage,
  restoreAccountsToManager,
} from '../../hooks/useAccountPersistence'
import { QRCodeLogin } from './QRCodeLogin'

// jsdom swaps in its own Uint8Array/ArrayBuffer, which the real NIP-44/schnorr crypto rejects
// next to Node-made bytes (TextEncoder output). Put Node's back so the exchange runs for real.
vi.hoisted(() => {
  const NodeUint8Array = new TextEncoder().encode('').constructor as Uint8ArrayConstructor
  globalThis.Uint8Array = NodeUint8Array
  globalThis.ArrayBuffer = new NodeUint8Array(0).buffer.constructor as ArrayBufferConstructor
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const FIPS_RELAY = 'wss://relay.studio.fips'
const PUBLIC_RELAY = 'wss://nos.lol'

// In-memory relays: each URL keeps its events, like a real relay answering a REQ.
let relays = new Map<string, ReplaySubject<NostrEvent>>()
const relay = (url: string) => {
  let stored = relays.get(url)
  if (!stored) relays.set(url, (stored = new ReplaySubject<NostrEvent>()))
  return stored
}
/** The NIP-46 transport of a client that can only reach the relays `reachable` admits. */
const transport = (reachable: (url: string) => boolean) => ({
  subscriptionMethod: (urls: string[], filters: Filter[]) => {
    const open = urls.filter(reachable)
    // No reachable relay hears nothing (an empty merge would complete and the signer's repeat()
    // would resubscribe in a tight loop).
    if (open.length === 0) return NEVER
    return merge(...open.map(url => relay(url))).pipe(
      distinct(event => event.id),
      filter(event => matchFilters(filters, event))
    )
  },
  publishMethod: async (urls: string[], event: NostrEvent) => {
    urls.filter(reachable).forEach(url => relay(url).next(event))
  },
})

/** The nostrconnect:// URI the dialog offers to the signer app. */
const shownUri = (container: HTMLElement) => {
  const href = container.querySelector('a[href^="nostrconnect:"]')?.getAttribute('href')
  if (!href) throw new Error('no nostrconnect link yet')
  return href
}

describe('QRCodeLogin', () => {
  beforeEach(() => {
    relays = new Map()
    localStorage.clear()
    // Like the host's relay pool: the browser only talks to relays the instance allowlist admits.
    const browser = transport(isRelayAllowed)
    NostrConnectSigner.subscriptionMethod = browser.subscriptionMethod
    NostrConnectSigner.publishMethod = browser.publishMethod
  })
  afterEach(() => {
    NostrConnectSigner.subscriptionMethod = undefined
    NostrConnectSigner.publishMethod = undefined
    setInstanceConfig(null as unknown as InstanceConfig)
  })

  it('pairs each attempt under a fresh client key and stays silent when they are abandoned', async () => {
    const onError = vi.fn()
    const manager = new AccountManager()
    const view = () => (
      <AccountsContext.Provider value={manager}>
        {/* A new onLogin each render, as LoginDialog passes it: every render restarts the wait. */}
        <QRCodeLogin onLogin={() => {}} onError={onError} relays={['wss://relay.example']} />
      </AccountsContext.Provider>
    )
    const { container, rerender, unmount } = render(view())
    const uris = [shownUri(container)]
    rerender(view())
    uris.push(shownUri(container))
    rerender(view())
    uris.push(shownUri(container))
    unmount()
    await act(async () => {})

    expect(onError).not.toHaveBeenCalled()
    const pairings = uris.map(uri => parseNostrConnectURI(uri))
    expect(new Set(pairings.map(pairing => pairing.client)).size).toBe(3)
    // Standalone hosts pass no name: signer apps keep seeing nostube.
    expect(pairings.map(pairing => pairing.metadata?.name)).toEqual([
      'nostube',
      'nostube',
      'nostube',
    ])
  })

  it('pairs a phone through a public relay outside the instance allowlist and keeps the session', async () => {
    // A FIPS instance: a phone outside FIPS cannot reach its relay, only the public one.
    setInstanceConfig({
      videoSources: [FIPS_RELAY],
      interactionRelays: [FIPS_RELAY],
    } as unknown as InstanceConfig)
    const phoneReaches = (url: string) => url !== FIPS_RELAY
    const pairingRelays = [PUBLIC_RELAY, FIPS_RELAY]
    const onLogin = vi.fn()
    const onError = vi.fn()
    const manager = new AccountManager()
    const { container, unmount } = render(
      <AccountsContext.Provider value={manager}>
        <QRCodeLogin
          onLogin={onLogin}
          onError={onError}
          relays={pairingRelays}
          clientName="Creek (studio.fips)"
        />
      </AccountsContext.Provider>
    )
    const uri = shownUri(container)
    const pairing = parseNostrConnectURI(uri)
    expect(pairing.metadata?.name).toBe('Creek (studio.fips)')
    expect(pairing.metadata?.url).toBe(window.location.origin)
    expect(pairing.relays).toEqual(pairingRelays)

    // The phone's signer app scans the code and answers on the relay it can reach.
    const user = new PrivateKeySigner()
    const userPubkey = await user.getPublicKey()
    let connects = 0
    const phone = new NostrConnectProvider({
      relays: pairing.relays.filter(phoneReaches),
      upstream: user,
      ...transport(phoneReaches),
      onConnect: () => ++connects === 1,
    })
    await phone.start(uri)

    await waitFor(() => expect(onLogin).toHaveBeenCalled(), { timeout: 5000 })
    expect(onError).not.toHaveBeenCalled()
    expect(manager.getActive()?.pubkey).toBe(userPubkey)

    // Persisted with exactly the pairing relays and this pairing's own client key.
    const [stored] = loadAccountsFromStorage()
    expect(NostrConnectSigner.parseBunkerURI(stored.data!).relays).toEqual(pairingRelays)
    expect(await PrivateKeySigner.fromKey(stored.clientKey!).getPublicKey()).toBe(pairing.client)

    // Closing the dialog must not require a second authorization before the Studio's login signature.
    unmount()
    const authentication = await manager.getActive()!.signEvent({
      kind: 27235,
      content: '',
      tags: [
        ['u', `${window.location.origin}/admin/login/nostr`],
        ['method', 'POST'],
      ],
      created_at: 0,
    })
    expect(verifyEvent(authentication)).toBe(true)
    expect(authentication.pubkey).toBe(userPubkey)

    // After a reload the restored session still signs through the phone.
    const reloaded = new AccountManager()
    await restoreAccountsToManager(reloaded)
    const signed = await reloaded
      .getActive()!
      .signEvent({ kind: 1, content: 'hi', tags: [], created_at: 0 })
    expect(signed.pubkey).toBe(userPubkey)
    expect(connects).toBe(1)
    await phone.stop()
  })
})
