import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SITE_LINKS } from '@nostube/core/instance-config'
import type { AdminConfig, SignerInfo } from './api'
import { ConnectKey } from './ConnectKey'
import { SignerProvider, useSigner, type SignerState } from './signer-context'
import i18n from './i18n'

const MANAGED = 'b'.repeat(64)
const OWN = 'c'.repeat(64)

const json = (body: unknown) => new Response(JSON.stringify(body))

/** The server's signer endpoints; `info` is what `GET /api/admin/signer` reports. */
function serve(info: SignerInfo) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/admin/signer' && init?.method === 'POST') {
      return json({ mode: 'managed', pubkey: MANAGED })
    }
    if (url === '/api/admin/signer') return json(info)
    if (url === '/api/admin/signer/sign') {
      return json({ ...JSON.parse(String(init?.body)), id: 'i', pubkey: MANAGED, sig: 's' })
    }
    return new Response(null, { status: 404 })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const extension = { getPublicKey: vi.fn(async () => OWN), signEvent: vi.fn() }

beforeEach(async () => {
  await i18n.changeLanguage('en')
  ;(window as unknown as { nostr?: object }).nostr = extension
})
afterEach(() => {
  delete (window as unknown as { nostr?: object }).nostr
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('SignerProvider', () => {
  let current: SignerState
  function Probe() {
    current = useSigner()
    return null
  }

  it('signs on the server when it holds the managed key, not with the extension', async () => {
    const fetch = serve({ mode: 'managed', pubkey: MANAGED })
    render(
      <SignerProvider>
        <Probe />
      </SignerProvider>
    )
    await waitFor(() => expect(current.status).toBe('ready'))
    expect(current.mode).toBe('managed')
    // Known without a prompt: nothing to connect.
    expect(current.pubkey).toBe(MANAGED)
    const event = { kind: 1, created_at: 1, tags: [], content: 'hi', pubkey: 'stale' }
    const signed = await current.signer!.signEvent(event)
    expect(signed.pubkey).toBe(MANAGED)
    const [, init] = fetch.mock.calls.find(([url]) => url === '/api/admin/signer/sign')!
    expect(JSON.parse(String(init?.body))).toEqual({
      kind: 1,
      created_at: 1,
      tags: [],
      content: 'hi',
    })
    expect(extension.signEvent).not.toHaveBeenCalled()
  })

  it('uses the extension when the owner signs with an own key', async () => {
    serve({ mode: 'own', pubkey: null })
    render(
      <SignerProvider>
        <Probe />
      </SignerProvider>
    )
    await waitFor(() => expect(current.status).toBe('ready'))
    expect(current.pubkey).toBeNull()
    expect(await current.connect()).toBe(OWN)
  })

  it('shows why when the server cannot tell where the key is', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'key locked' }), { status: 500 }))
    )
    render(
      <SignerProvider>
        <Probe />
      </SignerProvider>
    )
    await waitFor(() => expect(current.error).toBe('key locked'))
    expect(current.signer).toBeNull()
  })
})

describe('ConnectKey onboarding', () => {
  const fresh: AdminConfig = {
    title: 'T',
    creators: [],
    allowedWriters: [],
    videoSources: [],
    interactionRelays: [],
    profileRelays: [],
    mirror: { relays: [], blossom: [] },
    search: { mode: 'off' },
    storage: { quotaGib: 0, freeSpaceReserveGib: 5 },
    site: {
      tagline: '',
      theme: { accent: '#6d28d9', font: 'sans' },
      videos: { hidden: [] },
      links: DEFAULT_SITE_LINKS,
    },
  }
  const renderBanner = (onConnected: (pubkey: string) => Promise<void>) =>
    render(
      <SignerProvider>
        <ConnectKey config={fresh} onConnected={onConnected} busy={false} />
      </SignerProvider>
    )

  it('offers both keys on a new instance; the managed one is created on the server', async () => {
    const fetch = serve({ mode: 'none', pubkey: null })
    const onConnected = vi.fn(async () => {})
    renderBanner(onConnected)
    const managed = await screen.findByRole('button', { name: 'Create a managed key' })
    expect(screen.getByText('Managed key (default)')).toBeTruthy()
    expect(screen.getByText('Use my own key (NIP-07)')).toBeTruthy()
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Connect my key' }) as HTMLButtonElement).disabled
      ).toBe(false)
    )
    fireEvent.click(managed)
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith(MANAGED))
    expect(fetch).toHaveBeenCalledWith(
      '/api/admin/signer',
      expect.objectContaining({ method: 'POST' })
    )
    expect(extension.getPublicKey).not.toHaveBeenCalled()
  })

  it('adds the extension key when the owner picks their own', async () => {
    const fetch = serve({ mode: 'none', pubkey: null })
    const onConnected = vi.fn(async () => {})
    renderBanner(onConnected)
    const own = await screen.findByRole('button', { name: 'Connect my key' })
    await waitFor(() => expect((own as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(own)
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith(OWN))
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('does not offer a second key once the managed one exists', async () => {
    serve({ mode: 'managed', pubkey: MANAGED })
    const onConnected = vi.fn(async () => {})
    renderBanner(onConnected)
    const connect = await screen.findByRole('button', { name: 'Connect my key' })
    await waitFor(() => expect((connect as HTMLButtonElement).disabled).toBe(false))
    expect(screen.queryByRole('button', { name: 'Create a managed key' })).toBeNull()
    fireEvent.click(connect)
    await waitFor(() => expect(onConnected).toHaveBeenCalledWith(MANAGED))
  })
})
