import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { delay, from, lastValueFrom, throwError, toArray } from 'rxjs'
import type { Filter, NostrEvent } from 'nostr-tools'
import { eventStore, getTimelineLoader, relayPool, type PageLoader } from './core'

/** `content` carries the test label; ids are unique per label. */
function makeEvent(label: string, created_at: number, kind = 21): NostrEvent {
  return {
    id: label,
    pubkey: 'a'.repeat(64),
    kind,
    created_at,
    content: label,
    tags: [],
    sig: '',
  }
}

/** Fake relays answering like NIP-01: newest first, `until` inclusive, `limit` honoured. */
function mockRelays(relayEvents: Record<string, NostrEvent[] | 'error' | 'ignores-until'>) {
  return vi.spyOn(relayPool, 'request').mockImplementation(((
    relays: string[],
    filters: Filter[]
  ) => {
    const events = relayEvents[relays[0]]
    if (events === 'error') return throwError(() => new Error('connection refused'))
    if (events === 'ignores-until') return from([makeEvent('stuck', 50)]).pipe(delay(0))
    const list = filters.flatMap(({ kinds, until, limit }) =>
      events
        .filter(
          event => kinds?.includes(event.kind) && (until === undefined || event.created_at <= until)
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
})
