import { DEFAULT_SITE_LINKS, noSitePages } from './instance-config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { delay, from, lastValueFrom, throwError, toArray } from 'rxjs'
import { RelayGroup } from 'applesauce-relay'
import { finalizeEvent, verifyEvent, type Filter, type NostrEvent } from 'nostr-tools'
import { createNostubeClient, isRelaySecureForPage, type PageLoader } from './client'
import { setInstanceConfig, type InstanceConfig } from './instance-config'

// The only IndexedDB seam: the client talks to the cache through these nostr-idb calls.
const idb = vi.hoisted(() => ({
  openDB: vi.fn(async () => ({})),
  getEventsForFilters: vi.fn<(db: unknown, filters: Filter[]) => Promise<NostrEvent[]>>(
    async () => []
  ),
  addEvents: vi.fn(async () => {}),
  deleteEvent: vi.fn(async () => {}),
  // Mirrors nostr-idb, which throws for kinds that are neither replaceable nor addressable.
  deleteReplaceable: vi.fn(async (_db: unknown, _pubkey: string, kind: number, _d?: string) => {
    const replaceable = kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000)
    if (!replaceable && !(kind >= 30000 && kind < 40000))
      throw new Error(`Kind ${kind} is not replaceable`)
  }),
}))
vi.mock('nostr-idb', () => idb)

const { eventStore, getTimelineLoader, relayPool } = createNostubeClient({
  defaultRelays: [],
  cache: false,
})

/** `content` carries the test label; ids are unique per label. */
function makeEvent(
  label: string,
  created_at: number,
  kind = 21,
  pubkey = 'a'.repeat(64)
): NostrEvent {
  return {
    id: label,
    pubkey,
    kind,
    created_at,
    content: label,
    tags: [],
    sig: '',
  }
}

/** Fake relays answering like NIP-01: newest first, `until` inclusive, `limit` and `authors` honoured. */
function mockRelays(relayEvents: Record<string, NostrEvent[] | 'error' | 'ignores-until'>) {
  return vi.spyOn(relayPool, 'request').mockImplementation(((
    relays: string[],
    filters: Filter[]
  ) => {
    const events = relayEvents[relays[0]]
    if (events === 'error') return throwError(() => new Error('connection refused'))
    if (events === 'ignores-until') return from([makeEvent('stuck', 50)]).pipe(delay(0))
    const list = filters.flatMap(({ kinds, authors, until, limit }) =>
      events
        .filter(
          event =>
            kinds?.includes(event.kind) &&
            (!authors || authors.includes(event.pubkey)) &&
            (until === undefined || event.created_at <= until)
        )
        .slice(0, limit)
    )
    return from(list).pipe(delay(0))
  }) as unknown as typeof relayPool.request)
}

const loadPage = async (loader: PageLoader) =>
  (await lastValueFrom(loader().pipe(toArray()))).map(event => event.content)

describe('getTimelineLoader', () => {
  const verifyEvent = eventStore.verifyEvent
  beforeEach(() => {
    eventStore.verifyEvent = () => true
  })
  afterEach(() => {
    eventStore.verifyEvent = verifyEvent
    vi.restoreAllMocks()
  })

  it('pages each relay from its own cursor so a sparse relay does not skip a dense one', async () => {
    mockRelays({
      'wss://dense': Array.from({ length: 12 }, (_, i) => makeEvent(`dense-${100 - i}`, 100 - i)),
      'wss://sparse': [makeEvent('sparse-10', 10), makeEvent('sparse-5', 5)],
    })
    const loader = getTimelineLoader(
      't1',
      { kinds: [21], limit: 5 },
      ['wss://dense', 'wss://sparse'],
      {
        skipCache: true,
      }
    )

    expect(await loadPage(loader)).toEqual(
      expect.arrayContaining(['dense-100', 'dense-96', 'sparse-10', 'sparse-5'])
    )
    expect(await loadPage(loader)).toEqual([
      'dense-95',
      'dense-94',
      'dense-93',
      'dense-92',
      'dense-91',
    ])
    expect(await loadPage(loader)).toEqual(['dense-90', 'dense-89'])
    expect(await loadPage(loader)).toEqual([])
  })

  it('completes the page when a relay errors or ignores until, without looping on it', async () => {
    mockRelays({
      'wss://ok': [makeEvent('ok-1', 40)],
      'wss://down': 'error',
      'wss://stuck': 'ignores-until',
    })
    const loader = getTimelineLoader(
      't2',
      { kinds: [21], limit: 5 },
      ['wss://ok', 'wss://down', 'wss://stuck'],
      { skipCache: true }
    )

    expect(await loadPage(loader)).toEqual(expect.arrayContaining(['ok-1', 'stuck']))
    await loadPage(loader) // 'stuck' answers the same event for any until → marked done
    expect(await loadPage(loader)).toEqual([])
  })

  it('stops paging a relay once it has no more videos, even if it still returns deletions', async () => {
    const request = mockRelays({
      'wss://primal': [
        makeEvent('video-100', 100),
        makeEvent('video-99', 99),
        ...Array.from({ length: 98 }, (_, i) => makeEvent(`del-${100 - i}`, 100 - i, 5)),
      ],
    })
    const loader = getTimelineLoader('t3', { kinds: [21], limit: 2 }, ['wss://primal'], {
      skipCache: true,
    })

    await loadPage(loader)
    await loadPage(loader) // no videos left, only deletions
    expect(await loadPage(loader)).toEqual([])
    expect(request).toHaveBeenCalledTimes(2)
  })

  describe('endOnShortPage', () => {
    const videos = (n: number, prefix = 'v') =>
      Array.from({ length: n }, (_, i) => makeEvent(`${prefix}-${100 - i}`, 100 - i))
    const loaderFor = (relays: string[], endOnShortPage = true) =>
      getTimelineLoader('t', { kinds: [21], limit: 5 }, relays, { skipCache: true, endOnShortPage })

    it('is exhausted after a page every relay filled short, and asks no further page', async () => {
      const request = mockRelays({ 'wss://a': videos(3), 'wss://b': videos(4, 'b') })
      const loader = loaderFor(['wss://a', 'wss://b'])
      await loadPage(loader)
      expect(loader.exhausted?.()).toBe(true)
      expect(await loadPage(loader)).toEqual([])
      expect(request).toHaveBeenCalledTimes(2)
    })

    it('keeps going while a relay filled the whole page, and ends once it runs short', async () => {
      mockRelays({ 'wss://a': videos(7), 'wss://b': videos(2, 'b') })
      const loader = loaderFor(['wss://a', 'wss://b'])
      await loadPage(loader)
      expect(loader.exhausted?.()).toBe(false)
      await loadPage(loader) // the remaining two of a
      expect(loader.exhausted?.()).toBe(true)
    })

    it('does not count the deletions that ride along as videos', async () => {
      mockRelays({
        'wss://a': [
          ...videos(2),
          ...Array.from({ length: 10 }, (_, i) => makeEvent(`d-${i}`, 50 - i, 5)),
        ],
      })
      const loader = loaderFor(['wss://a'])
      expect(
        (await loadPage(loader)).filter(label => label.startsWith('d-')).length
      ).toBeGreaterThan(2)
      expect(loader.exhausted?.()).toBe(true) // more events than the limit, but only 2 videos
    })

    it('is not exhausted by a short page unless asked for', async () => {
      mockRelays({ 'wss://a': videos(3) })
      const loader = loaderFor(['wss://a'], false)
      await loadPage(loader)
      expect(loader.exhausted?.()).toBe(false)
    })
  })

  describe('relayAuthors', () => {
    const at = (pubkey: string, n: number, kind = 21) =>
      makeEvent(`${kind === 5 ? 'del' : pubkey}-${n}`, n, kind, pubkey)
    const everyone = [at('alice', 10), at('bob', 9), at('carol', 8)]

    it('asks each relay only for its own authors and pages each from its own cursor', async () => {
      const request = mockRelays({
        'wss://r1': [
          at('alice', 100),
          at('carol', 99), // carol lives on r2; r1 must not be asked for her
          at('bob', 98),
          at('alice', 97),
          at('bob', 96),
          at('carol', 90, 5),
          at('alice', 89, 5),
        ],
        'wss://r2': [at('carol', 50), at('alice', 49), at('carol', 48), at('carol', 47)],
        'wss://missing': everyone,
        'wss://empty': everyone,
      })
      const loader = getTimelineLoader(
        't-outbox',
        { kinds: [21], authors: ['alice', 'bob', 'carol'], limit: 2 },
        ['wss://r1', 'wss://r2', 'wss://missing', 'wss://empty'],
        {
          skipCache: true,
          relayAuthors: {
            'wss://r1': ['alice', 'bob', 'mallory'],
            'wss://r2': ['carol'],
            'wss://empty': [],
          },
        }
      )

      const first = await loadPage(loader)
      expect(first).toEqual(
        expect.arrayContaining(['alice-100', 'bob-98', 'carol-50', 'carol-48', 'del-89'])
      )
      expect(first).not.toEqual(expect.arrayContaining(['carol-99']))
      expect(first).not.toEqual(expect.arrayContaining(['alice-49']))
      expect(first).not.toEqual(expect.arrayContaining(['del-90']))
      expect(await loadPage(loader)).toEqual(
        expect.arrayContaining(['alice-97', 'bob-96', 'carol-47'])
      )
      await loadPage(loader) // r1 only has a deletion left, r2 nothing
      expect(loader.exhausted?.()).toBe(true)

      const r1 = ['alice', 'bob']
      const r2 = ['carol']
      const page = (authors: string[], until?: number) => [
        { kinds: [21], authors, limit: 2, until },
        { kinds: [5], authors, limit: 2, until },
      ]
      expect(request.mock.calls.slice(0, 4).map(([relays, filters]) => [relays, filters])).toEqual([
        [['wss://r1'], page(r1)],
        [['wss://r2'], page(r2)],
        [['wss://r1'], page(r1, 97)],
        [['wss://r2'], page(r2, 47)],
      ])
      const asked = request.mock.calls.map(([relays]) => (relays as string[])[0])
      expect(asked).not.toContain('wss://missing')
      expect(asked).not.toContain('wss://empty')
    })

    it('never sends an unfiltered query for a missing, empty or disjoint mapping', async () => {
      const request = mockRelays({ 'wss://a': everyone, 'wss://b': everyone, 'wss://c': everyone })
      const loader = getTimelineLoader(
        't-outbox-empty',
        { kinds: [21], authors: ['alice'], limit: 5 },
        ['wss://a', 'wss://b', 'wss://c'],
        { skipCache: true, relayAuthors: { 'wss://b': [], 'wss://c': ['bob'] } }
      )

      expect(await loadPage(loader)).toEqual([])
      expect(request).not.toHaveBeenCalled()
      expect(loader.exhausted?.()).toBe(true)
    })
  })
})

describe('local cache', () => {
  const client = createNostubeClient({ defaultRelays: [] })
  afterEach(() => {
    vi.restoreAllMocks()
    idb.getEventsForFilters.mockClear()
  })

  it('keeps relay lists past the TTL that drops old timeline events', async () => {
    const yearAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60
    idb.getEventsForFilters.mockResolvedValueOnce([
      makeEvent('old-relays', yearAgo, 10002),
      makeEvent('old-video', yearAgo),
      makeEvent('new-video', Math.floor(Date.now() / 1000)),
    ])

    const events = await client.cacheRequest([{ kinds: [10002, 21] }])
    expect(events.map(event => event.content)).toEqual(['old-relays', 'new-video'])
  })

  it('reads every base author from cache while relays stay scoped', async () => {
    const request = vi.spyOn(client.relayPool, 'request')
    const loader = client.getTimelineLoader(
      't-cache',
      { kinds: [21], authors: ['alice', 'bob'], limit: 5 },
      ['wss://r1'],
      { relayAuthors: {} }
    )

    await lastValueFrom(loader().pipe(toArray()))
    expect(request).not.toHaveBeenCalled()
    const [, filters] = idb.getEventsForFilters.mock.calls[0]
    expect(filters[0]).toEqual({ kinds: [21], authors: ['alice', 'bob'], limit: 5 })
    expect(filters.every(filter => filter.authors?.join() === 'alice,bob')).toBe(true)
  })

  it('deletes valid targets and skips a coordinates that cannot be replaceable', async () => {
    const author = 'a'.repeat(64)
    idb.deleteReplaceable.mockClear()
    const deletion = {
      ...makeEvent('deletion', 100, 5, author),
      tags: [
        ['e', 'video-id'],
        ['a', `7:${author}:`],
        ['a', `:${author}:`],
        ['a', `34235:${author}:my-video`],
        ['a', `10002:${author}:`],
      ],
    }

    await expect(client.cacheEvents([deletion])).resolves.toBeUndefined()
    expect(idb.addEvents).toHaveBeenCalledWith(expect.anything(), [deletion])
    expect(idb.deleteEvent).toHaveBeenCalledWith(expect.anything(), 'video-id')
    expect(
      idb.deleteReplaceable.mock.calls.map(([, pubkey, kind, d]) => [pubkey, kind, d])
    ).toEqual([
      [author, 34235, 'my-video'],
      [author, 10002, ''],
    ])
  })
})

describe('instance scoping', () => {
  const creator = 'c'.repeat(64)
  const stranger = 'd'.repeat(64)
  const instance: InstanceConfig = {
    version: 1,
    revision: 1,
    origin: 'https://example.org',
    title: 'Test',
    creators: [creator],
    startPage: { kind: 'creator-profile', creator },
    videoSources: ['wss://videos.example'],
    interactionRelays: ['wss://interact.example'],
    profileRelays: [],
    signerRelays: [],
    search: { mode: 'off' },
    site: {
      tagline: '',
      theme: { accent: '#6d28d9', font: 'sans' },
      videos: { hidden: [] },
      links: DEFAULT_SITE_LINKS,
      pages: noSitePages(),
    },
  }

  afterEach(() => {
    setInstanceConfig(null as unknown as InstanceConfig)
  })

  it('refuses an instance that was not registered with setInstanceConfig', () => {
    expect(() => createNostubeClient({ defaultRelays: [], cache: false, instance })).toThrow(
      /setInstanceConfig/
    )
  })

  it('does not send video requests for authors that are not creators', async () => {
    setInstanceConfig(instance)
    const client = createNostubeClient({ defaultRelays: [], cache: false, instance })

    const events = await lastValueFrom(
      client.relayPool
        .request(['wss://videos.example'], [{ kinds: [21], authors: [stranger] }])
        .pipe(toArray())
    )

    expect(events).toEqual([])
    expect(client.relayPool.relays.size).toBe(0)
  })

  it('loads only the visitor identity from external relays without opening video requests', async () => {
    setInstanceConfig(instance)
    const client = createNostubeClient({ defaultRelays: [], cache: false, instance })
    // The root verifier handles jsdom's cross-realm TextEncoder bytes.
    client.eventStore.verifyEvent = verifyEvent
    const secret = new Uint8Array(32).fill(3)
    const profile = finalizeEvent(
      { kind: 0, content: '{"display_name":"Visitor"}', tags: [], created_at: 10 },
      secret
    )
    const list = finalizeEvent({ kind: 10002, content: '', tags: [], created_at: 10 }, secret)
    const video = finalizeEvent({ kind: 21, content: '', tags: [], created_at: 10 }, secret)
    const anotherProfile = finalizeEvent(
      { kind: 0, content: '{"display_name":"Stranger"}', tags: [], created_at: 10 },
      new Uint8Array(32).fill(4)
    )
    const request = vi
      .spyOn(RelayGroup.prototype, 'request')
      .mockReturnValue(from([profile, list, video, anotherProfile]))
    try {
      expect(
        await lastValueFrom(
          client.requestVisitorIdentity(profile.pubkey, ['wss://personal.test']).pipe(toArray())
        )
      ).toEqual([profile, list])
      expect(client.eventStore.getEvent(profile.id)).toEqual(profile)
      expect(client.eventStore.getEvent(video.id)).toBeUndefined()
      expect(client.eventStore.getEvent(anotherProfile.id)).toBeUndefined()
      expect(
        await lastValueFrom(
          client.relayPool
            .request(['wss://personal.test'], [{ kinds: [21], authors: [creator] }])
            .pipe(toArray())
        )
      ).toEqual([])
      expect(client.relayPool.group(['wss://personal.test']).relays).toEqual([])
    } finally {
      request.mockRestore()
      client.reset()
    }
  })

  it('keeps video events of non-creators out of the event store', () => {
    setInstanceConfig(instance)
    const client = createNostubeClient({ defaultRelays: [], cache: false, instance })
    const event = { ...makeEvent('stranger-video', 10), pubkey: stranger }

    expect(client.eventStore.verifyEvent?.(event)).toBe(false)
  })
})

describe('isRelaySecureForPage', () => {
  const withPage = (url: string | undefined, run: () => void) => {
    vi.stubGlobal('location', url ? new URL(url) : undefined)
    try {
      run()
    } finally {
      vi.unstubAllGlobals()
    }
  }

  afterEach(() => vi.unstubAllGlobals())

  it('drops ws:// off loopback on an https page', () => {
    withPage('https://nostu.be/', () => {
      expect(isRelaySecureForPage('ws://umbrel.local:4848')).toBe(false)
      expect(
        isRelaySecureForPage('ws://aoixkasea4lchitjklwve4tkgejdrgslahdtapbzdi37uljd76c3plqd.onion/')
      ).toBe(false)
      expect(isRelaySecureForPage('ws://192.168.1.10:8080')).toBe(false)
    })
  })

  it('keeps loopback ws:// and every wss:// relay on an https page', () => {
    withPage('https://nostu.be/', () => {
      expect(isRelaySecureForPage('ws://localhost:4848')).toBe(true)
      expect(isRelaySecureForPage('ws://127.0.0.1:24242')).toBe(true)
      expect(isRelaySecureForPage('ws://[::1]:7777')).toBe(true)
      expect(isRelaySecureForPage('wss://relay.damus.io')).toBe(true)
    })
  })

  it('only gates https pages', () => {
    withPage('http://umbrel.local:8080/', () => {
      expect(isRelaySecureForPage('ws://umbrel.local:4848')).toBe(true)
    })
    withPage(undefined, () => {
      expect(isRelaySecureForPage('ws://umbrel.local:4848')).toBe(true)
    })
  })

  it('the pool drops insecure relays before connecting', () => {
    withPage('https://nostu.be/', () => {
      expect(
        relayPool.group(['ws://umbrel.local:4848', 'wss://relay.damus.io']).relays.map(r => r.url)
      ).toEqual(['wss://relay.damus.io/'])
    })
  })
})
