import { afterEach, describe, expect, it, vi } from 'vitest'
import { matchFilters, type Filter, type NostrEvent } from 'nostr-tools'
import { delay, firstValueFrom, from, lastValueFrom, Subject, take, toArray } from 'rxjs'
import { createNostubeClient, type PageLoader } from './client'
import { createSubscriptionsLoader } from './subscriptions-loader'

const alice = 'a'.repeat(64)
const bob = 'b'.repeat(64)
const carol = 'c'.repeat(64)
const discovery = 'wss://discovery.test/'
const shared = 'wss://shared.test/'
const own = 'wss://own.test/'
const fallback = 'wss://fallback.test/'

function event(
  id: string,
  pubkey: string,
  created_at: number,
  kind = 21,
  tags: string[][] = []
): NostrEvent {
  return { id, pubkey, created_at, kind, tags, content: id, sig: '' }
}

function setup(events: Record<string, NostrEvent[]>) {
  const client = createNostubeClient({ defaultRelays: [], cache: false })
  client.eventStore.verifyEvent = () => true
  const requests: Array<{ relay: string; filters: Filter[] }> = []
  vi.spyOn(client.relayPool, 'request').mockImplementation(((
    relays: string[],
    filters: Filter[]
  ) => {
    return from(
      relays.flatMap(relay => {
        requests.push({ relay, filters })
        return (events[relay] ?? []).filter(event => matchFilters(filters, event))
      })
    ).pipe(delay(0))
  }) as typeof client.relayPool.request)
  return { client, requests }
}

const page = (loader: PageLoader) => lastValueFrom(loader().pipe(toArray()))
const videoRequests = (requests: Array<{ relay: string; filters: Filter[] }>) =>
  requests.filter(request => request.filters.some(filter => filter.kinds?.includes(21)))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('subscriptions outbox feed', () => {
  it('discovers in one batch and fetches private-relay videos and shorts only for that relay’s creators', async () => {
    const { client, requests } = setup({
      [discovery]: [
        event('alice-list', alice, 1, 10002, [
          ['r', shared, 'write'],
          ['r', own, 'read'],
          ['r', 'garbage', 'write'],
        ]),
        event('bob-list', bob, 2, 10002, [
          ['r', shared],
          ['r', shared.slice(0, -1)],
          ['r', own, 'write'],
        ]),
      ],
      [shared]: [
        event('alice-video', alice, 100),
        event('bob-short', bob, 90, 22),
        event('stranger', carol, 95),
      ],
      [own]: [event('bob-video', bob, 80), event('alice-inbox-only', alice, 70)],
      [fallback]: [event('carol-legacy', carol, 60)],
    })
    const loader = createSubscriptionsLoader(
      client,
      [bob, alice, carol, alice],
      [fallback],
      [discovery]
    )
    expect((await page(loader)).map(event => event.id).sort()).toEqual([
      'alice-video',
      'bob-short',
      'bob-video',
      'carol-legacy',
    ])
    expect(requests.filter(request => request.relay === discovery)).toEqual([
      { relay: discovery, filters: [{ kinds: [10002], authors: [alice, bob, carol] }] },
    ])
    expect(
      videoRequests(requests).map(({ relay, filters }) => [relay, filters[0].authors])
    ).toEqual([
      [fallback, [alice, bob, carol]],
      [shared, [alice, bob]],
      [own, [bob]],
    ])
    expect(
      videoRequests(requests).every(
        ({ filters }) => JSON.stringify(filters[0].authors) === JSON.stringify(filters[1].authors)
      )
    ).toBe(true)
  })

  it('shares concurrent discovery and caches absent lists as well as found lists across feed mounts', async () => {
    const { client, requests } = setup({
      [discovery]: [event('alice-list', alice, 1, 10002, [['r', own]])],
      [own]: [event('alice-video', alice, 100)],
    })
    await Promise.all([
      page(createSubscriptionsLoader(client, [alice, bob], [], [discovery])),
      page(createSubscriptionsLoader(client, [alice, bob], [], [discovery])),
    ])
    await page(createSubscriptionsLoader(client, [alice, bob], [], [discovery]))
    expect(requests.filter(request => request.relay === discovery)).toHaveLength(1)
    expect(client.eventStore.getReplaceable(10002, alice)?.id).toBe('alice-list')
  })

  it('revalidates discovery after five minutes and uses a newer relay list', async () => {
    const events = { [discovery]: [event('old-list', alice, 1, 10002, [['r', shared]])] }
    const { client, requests } = setup(events)
    await page(createSubscriptionsLoader(client, [alice], [], [discovery]))
    events[discovery] = [event('new-list', alice, 2, 10002, [['r', own]])]
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 5 * 60 * 1000 + 1)
    await page(createSubscriptionsLoader(client, [alice], [], [discovery]))
    expect(requests.filter(request => request.relay === discovery)).toHaveLength(2)
    expect(videoRequests(requests).some(request => request.relay === own)).toBe(true)
    expect(client.eventStore.getReplaceable(10002, alice)?.id).toBe('new-list')
  })

  it('starts persisted outboxes and follow hints without waiting for discovery, without duplicating configured relays', async () => {
    const { client, requests } = setup({
      [own]: [event('own-video', alice, 100)],
      [shared]: [event('hint-short', bob, 90, 22)],
    })
    vi.spyOn(client, 'cacheRequest').mockResolvedValue([
      event('persisted-list', alice, 1, 10002, [
        ['r', own],
        ['r', fallback],
      ]),
    ])
    const discoveryResult = new Subject<NostrEvent>()
    const request = vi.mocked(client.relayPool.request).getMockImplementation()!
    vi.spyOn(client.relayPool, 'request').mockImplementation(((
      relays: string[],
      filters: Filter[]
    ) =>
      filters.some(filter => filter.kinds?.includes(10002))
        ? discoveryResult
        : request(relays, filters)) as typeof client.relayPool.request)
    const loader = createSubscriptionsLoader(client, [alice, bob], [fallback], [discovery], {
      [bob]: [shared],
    })
    const result = await firstValueFrom(loader().pipe(take(2), toArray()))
    expect(result.map(event => event.id).sort()).toEqual(['hint-short', 'own-video'])
    expect(
      videoRequests(requests)
        .map(request => request.relay)
        .sort()
    ).toEqual([fallback, own, shared].sort())
    expect(loader.exhausted?.()).toBe(false)
    discoveryResult.complete()
  })

  it('continues each source’s own cursor and completes when every source is empty', async () => {
    const { client, requests } = setup({
      [discovery]: [event('list', alice, 1, 10002, [['r', own]])],
      [fallback]: [event('public', bob, 200)],
      [own]: [event('private', alice, 50)],
    })
    const loader = createSubscriptionsLoader(client, [alice, bob], [fallback], [discovery])
    expect((await page(loader)).map(event => event.id).sort()).toEqual(['private', 'public'])
    expect(loader.exhausted?.()).toBe(false)
    expect(await page(loader)).toEqual([])
    expect(loader.exhausted?.()).toBe(true)
    expect(
      videoRequests(requests)
        .slice(-2)
        .map(({ relay, filters }) => [relay, filters[0].until])
    ).toEqual([
      [fallback, 199],
      [own, 49],
    ])
  })

  it('does not issue unfiltered requests for an empty or invalid follow list', async () => {
    const { client, requests } = setup({})
    const loader = createSubscriptionsLoader(client, ['', 'invalid'], [fallback], [discovery])
    expect(await page(loader)).toEqual([])
    expect(loader.exhausted?.()).toBe(true)
    expect(requests).toEqual([])
  })
})
