import { it, expect, vi, afterEach } from 'vitest'
import { EventStore } from 'applesauce-core'
import { RelayPool } from 'applesauce-relay'
import { EMPTY, Subject, throwError, of } from 'rxjs'
import type { NostrEvent } from 'nostr-tools'
import { loadInteractions } from './interaction-loader'

const id = 'a'.repeat(64)
const address = `34236:${'b'.repeat(64)}:short`
const relays = ['wss://relay.example']
afterEach(() => vi.useRealTimers())

it('combines overlapping consumers and keeps both address and event comment/reaction paths', async () => {
  const pool = new RelayPool()
  const store = new EventStore()
  const response = new Subject<NostrEvent>()
  const request = vi.spyOn(pool, 'request').mockReturnValue(response)
  const preloaded = loadInteractions(pool, store, relays, { eventIds: [id], address })
  const reactions = loadInteractions(pool, store, ['wss://relay.example/'], {
    eventIds: [id],
    address,
    comments: false,
  })
  await Promise.resolve()
  expect(request).toHaveBeenCalledTimes(1)
  const filters = request.mock.calls[0][1]
  expect(filters).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kinds: [7], '#e': [id] }),
      expect.objectContaining({ kinds: [7], '#a': [address] }),
      expect.objectContaining({ kinds: [1], '#e': [id] }),
      expect.objectContaining({ kinds: [1], '#a': [address] }),
      expect.objectContaining({ kinds: [1111], '#E': [id] }),
      expect.objectContaining({ kinds: [1111], '#A': [address] }),
    ])
  )
  response.complete()
  await Promise.all([preloaded, reactions])
})

it('reuses empty completed reads briefly, then refreshes; additional relays are not skipped', async () => {
  vi.useFakeTimers()
  const pool = new RelayPool()
  const store = new EventStore()
  const request = vi.spyOn(pool, 'request').mockReturnValue(EMPTY)
  const first = loadInteractions(pool, store, relays, { eventIds: [id] })
  await vi.runAllTicks()
  await first
  await loadInteractions(pool, store, relays, { eventIds: [id] })
  expect(request).toHaveBeenCalledTimes(1)
  const extra = loadInteractions(pool, store, [...relays, 'wss://other.example'], {
    eventIds: [id],
  })
  await vi.runAllTicks()
  await extra
  expect(request).toHaveBeenCalledTimes(2)
  vi.advanceTimersByTime(30_001)
  const refresh = loadInteractions(pool, store, relays, { eventIds: [id] })
  await vi.runAllTicks()
  await refresh
  expect(request).toHaveBeenCalledTimes(3)
})

it('does not cache failures or share freshness between event stores', async () => {
  const pool = new RelayPool()
  const store = new EventStore()
  const request = vi
    .spyOn(pool, 'request')
    .mockReturnValueOnce(throwError(() => new Error('offline')))
    .mockReturnValue(EMPTY)
  await expect(loadInteractions(pool, store, relays, { eventIds: [id] })).rejects.toThrow('offline')
  await loadInteractions(pool, store, relays, { eventIds: [id] })
  await loadInteractions(pool, new EventStore(), relays, { eventIds: [id] })
  expect(request).toHaveBeenCalledTimes(3)
})

it('does not mistake relay refusal or connection errors for an empty EOSE', async () => {
  const pool = new RelayPool()
  pool.ignoreOffline = false
  const store = new EventStore()
  const relay = pool.relay(relays[0])
  const req = vi
    .spyOn(relay, 'req')
    .mockReturnValueOnce(of({ type: 'CLOSED', from: relay.url, id: 'test', reason: 'denied' }))
    .mockReturnValueOnce(throwError(() => new Error('disconnected')))
    .mockReturnValue(of({ type: 'EOSE', from: relay.url, id: 'test' }))
  await expect(loadInteractions(pool, store, relays, { eventIds: [id] })).rejects.toThrow('denied')
  await expect(loadInteractions(pool, store, relays, { eventIds: [id] })).rejects.toThrow(
    'disconnected'
  )
  await loadInteractions(pool, store, relays, { eventIds: [id] })
  await loadInteractions(pool, store, relays, { eventIds: [id] })
  expect(req).toHaveBeenCalledTimes(3)
  pool.close()
})
