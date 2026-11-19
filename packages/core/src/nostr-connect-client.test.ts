import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { matchFilters, type Filter, type NostrEvent } from 'nostr-tools'
import { ReplaySubject, filter, merge } from 'rxjs'
import { NostrConnectProvider, NostrConnectSigner, PrivateKeySigner } from 'applesauce-signers'
import { connectBunker, nostrConnectClient } from './nostr-connect-client'
import { setInstanceConfig, type InstanceConfig } from './instance-config'

// jsdom swaps in its own Uint8Array/ArrayBuffer, which the real NIP-44/schnorr crypto rejects
// next to Node-made bytes. Put Node's back so the handshake runs for real.
vi.hoisted(() => {
  const NodeUint8Array = new TextEncoder().encode('').constructor as Uint8ArrayConstructor
  globalThis.Uint8Array = NodeUint8Array
  globalThis.ArrayBuffer = new NodeUint8Array(0).buffer.constructor as ArrayBufferConstructor
})

const RELAY = 'wss://relay.example'
let relays = new Map<string, ReplaySubject<NostrEvent>>()
const relay = (url: string) => {
  let stored = relays.get(url)
  if (!stored) relays.set(url, (stored = new ReplaySubject<NostrEvent>()))
  return stored
}
const transport = {
  subscriptionMethod: (urls: string[], filters: Filter[]) =>
    merge(...urls.map(relay)).pipe(filter(event => matchFilters(filters, event))),
  publishMethod: async (urls: string[], event: NostrEvent) => {
    urls.forEach(url => relay(url).next(event))
  },
}

describe('connectBunker', () => {
  beforeEach(() => {
    relays = new Map()
    NostrConnectSigner.subscriptionMethod = transport.subscriptionMethod
    NostrConnectSigner.publishMethod = transport.publishMethod
  })
  afterEach(() => {
    NostrConnectSigner.subscriptionMethod = undefined
    NostrConnectSigner.publishMethod = undefined
    setInstanceConfig(null as unknown as InstanceConfig)
  })

  it('tells the remote signer which client connects, and the login still succeeds', async () => {
    const user = new PrivateKeySigner()
    const bunker = new NostrConnectProvider({ relays: [RELAY], upstream: user, ...transport })
    // handleConnect is protected; the spy only records the params the bunker receives.
    const handleConnect = vi.spyOn(
      bunker as unknown as { handleConnect: (client: string, params: string[]) => Promise<string> },
      'handleConnect'
    )
    await bunker.start()
    const uri = await bunker.getBunkerURI()

    const signer = await connectBunker(uri, nostrConnectClient('Creek (studio.fips)'))

    expect(await signer.getPublicKey()).toBe(await user.getPublicKey())
    const [, params] = handleConnect.mock.calls[0]
    expect(params).toHaveLength(4)
    expect(params[2]).toBe('')
    expect(JSON.parse(params[3])).toEqual({
      name: 'Creek (studio.fips)',
      url: window.location.origin,
      image: `${window.location.origin}/apple-touch-icon.png`,
    })
    await signer.close()
    await bunker.stop()
  })

  it('names the client nostube unless an instance passes its own name', () => {
    expect(nostrConnectClient().name).toBe('nostube')
  })

  it("shows an instance's uploaded icon, and nostube's when it has none", () => {
    const origin = window.location.origin
    const instance = { videoSources: [], interactionRelays: [] }
    setInstanceConfig({
      ...instance,
      site: { icon: '/branding/icon?v=abc' },
    } as unknown as InstanceConfig)
    expect(nostrConnectClient().image).toBe(`${origin}/branding/icon?v=abc`)
    setInstanceConfig({ ...instance, site: {} } as unknown as InstanceConfig)
    expect(nostrConnectClient().image).toBe(`${origin}/apple-touch-icon.png`)
  })
})
