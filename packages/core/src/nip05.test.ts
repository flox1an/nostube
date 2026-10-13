import { afterEach, describe, expect, it, vi } from 'vitest'
import { displayNip05, resolveNip05, verifyNip05 } from './nip05'

const PUBKEY = 'a'.repeat(64)

const serve = (body: unknown, status = 200) => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveNip05', () => {
  it('asks the domain for the name and keeps only ws(s) relays', async () => {
    const fetchMock = serve({
      names: { bob: PUBKEY },
      relays: { [PUBKEY]: ['wss://relay.example', 'https://not-a-relay.example', 42] },
    })
    await expect(resolveNip05('bob@example.com')).resolves.toEqual({
      pubkey: PUBKEY,
      relays: ['wss://relay.example'],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/.well-known/nostr.json?name=bob',
      expect.anything()
    )
  })

  it('reads a bare domain as _@domain and works without relays', async () => {
    const fetchMock = serve({ names: { _: PUBKEY } })
    await expect(resolveNip05('example.com')).resolves.toEqual({ pubkey: PUBKEY, relays: [] })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/.well-known/nostr.json?name=_',
      expect.anything()
    )
  })

  it('rejects an unknown name, a non-hex pubkey, an HTTP error and a network error', async () => {
    serve({ names: { _: PUBKEY } })
    await expect(resolveNip05('bob@example.com')).rejects.toThrow(/not found/)
    serve({ names: { _: 'npub1xyz' } })
    await expect(resolveNip05('_@example.com')).rejects.toThrow(/not found/)
    serve({}, 404)
    await expect(resolveNip05('_@example.com')).rejects.toThrow(/404/)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(resolveNip05('_@example.com')).rejects.toThrow(/Failed to reach/)
  })
})

describe('verifyNip05', () => {
  it('is true only for the pubkey the address names', async () => {
    serve({ names: { _: PUBKEY } })
    expect(await verifyNip05('_@example.com', PUBKEY)).toBe(true)
    expect(await verifyNip05('_@example.com', 'b'.repeat(64))).toBe(false)
    serve({}, 500)
    expect(await verifyNip05('_@example.com', PUBKEY)).toBe(false)
  })
})

describe('displayNip05', () => {
  it('shows _@domain as @domain and keeps named addresses', () => {
    expect(displayNip05('_@example.com')).toBe('@example.com')
    expect(displayNip05('bob@example.com')).toBe('bob@example.com')
  })
})
