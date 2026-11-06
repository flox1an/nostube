import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useEventStore } from 'applesauce-react/hooks'
import { createAddressLoader } from 'applesauce-loaders/loaders'
import { lastValueFrom, takeUntil, timer, toArray } from 'rxjs'
import { nip19, type Filter } from 'nostr-tools'
import { useAppContext } from '@/hooks/useAppContext'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useUserRelaysContext } from '@/contexts/UserRelaysContext'
import { useNostrQuery } from '@/nostr/useNostrQuery'
import { METADATA_RELAYS, INDEXER_RELAYS } from '@/constants/relays'
import { getInstanceConfig, isRelayAllowed } from '@nostube/core/instance-config'
import { isRelaySecureForPage } from '@nostube/core/client'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import {
  decodeRelaySet,
  normalizeBrowseRelay,
  relaySetSource,
  sourceFromSearch,
  sourceKey,
  sourceSearch,
  type BrowseSource,
} from '@/lib/relay-browsing'
import i18n from '@/i18n/config'
import { toast } from 'sonner'

interface RelayBrowsingValue {
  source: BrowseSource | null
  selectSource: (source: BrowseSource | null) => void
  pendingSource: BrowseSource | null
  favorites: BrowseSource[]
  saveSource: (source: BrowseSource) => void
  removeFavorite: (key: string) => void
  sets: BrowseSource[]
  favoriteRelays: string[]
  setsLoading: boolean
  resolveSet: (input: string) => Promise<BrowseSource>
  error: string | null
}

const RelayBrowsingContext = createContext<RelayBrowsingValue | null>(null)
const EMPTY: BrowseSource[] = []

function readFavorites(key: string): BrowseSource[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    if (!Array.isArray(value)) return EMPTY
    return value.flatMap((entry: BrowseSource) => {
      try {
        if (typeof entry.title !== 'string' || !Array.isArray(entry.relays)) return []
        if (entry.address) decodeRelaySet(entry.address)
        const relays = [...new Set(entry.relays.map(normalizeBrowseRelay))]
        return relays.length ? [{ ...entry, relays }] : []
      } catch {
        return []
      }
    })
  } catch {
    return EMPTY
  }
}

export function RelayBrowsingProvider({ children }: { children: ReactNode }) {
  const { config, pool } = useAppContext()
  const { user } = useCurrentUser()
  const pubkey = user?.pubkey
  const { writeRelays } = useUserRelaysContext()
  const store = useEventStore()
  const location = useLocation()
  const navigate = useNavigate()
  const storageKey = `nostube:browse-sources:${user?.pubkey ?? 'anonymous'}`
  const [saved, setSaved] = useState(() => ({
    key: storageKey,
    sources: readFavorites(storageKey),
  }))
  const favorites = useMemo(
    () => (saved.key === storageKey ? saved.sources : readFavorites(storageKey)),
    [saved, storageKey]
  )
  const [resolved, setResolved] = useState<BrowseSource | null>(null)
  const [approved, setApproved] = useState<{ address: string; pubkey?: string } | null>(null)
  const [resolutionError, setResolutionError] = useState<string | null>(null)

  const parsed = useMemo<{ source: BrowseSource | null; error: string | null }>(() => {
    try {
      return { source: sourceFromSearch(location.search), error: null }
    } catch (error) {
      return {
        source: { title: 'Invalid source', relays: [] },
        error: error instanceof Error ? error.message : 'Invalid browse source.',
      }
    }
  }, [location.search])
  const discoveryRelays = useMemo(
    () =>
      [
        ...new Set([
          ...(writeRelays ?? []),
          ...config.relays.map(r => r.url),
          ...METADATA_RELAYS,
          ...INDEXER_RELAYS,
        ]),
      ].filter(url => isRelayAllowed(url) && isRelaySecureForPage(url)),
    [writeRelays, config.relays]
  )
  const ownFilter = useMemo(
    () =>
      pubkey && !getInstanceConfig()
        ? [
            { kinds: [10012], authors: [pubkey], limit: 1 },
            { kinds: [30002], authors: [pubkey], limit: 100 },
          ]
        : null,
    [pubkey]
  )
  const own = useNostrQuery(ownFilter, { relays: discoveryRelays })
  const feeds = own.events
    .filter(event => event.kind === 10012)
    .sort((a, b) => b.created_at - a.created_at)[0]
  const referenceFilters = useMemo(
    () =>
      feeds?.tags
        .flatMap(tag => {
          if (tag[0] !== 'a' || !tag[1]) return []
          const [kind, pubkey, ...identifier] = tag[1].split(':')
          return kind === '30002' && /^[a-f0-9]{64}$/.test(pubkey)
            ? [
                {
                  kinds: [30002],
                  authors: [pubkey],
                  '#d': [identifier.join(':')],
                  limit: 1,
                } as Filter,
              ]
            : []
        })
        .slice(0, 100) ?? [],
    [feeds]
  )
  const referenced = useNostrQuery(referenceFilters.length ? referenceFilters : null, {
    relays: discoveryRelays,
  })
  const sets = useMemo(() => {
    const result = new Map<string, BrowseSource>()
    for (const event of [...own.events, ...referenced.events].sort(
      (a, b) => a.created_at - b.created_at
    )) {
      if (event.kind !== 30002) continue
      try {
        const source = relaySetSource(event)
        result.set(sourceKey(source), source)
      } catch {
        const identifier = event.tags.find(tag => tag[0] === 'd')?.[1]
        if (identifier === undefined) continue
        result.set(`30002:${event.pubkey}:${identifier}`, {
          title: event.tags.find(tag => tag[0] === 'title')?.[1] || identifier || 'Relay set',
          relays: [],
          address: nip19.naddrEncode({
            kind: 30002,
            pubkey: event.pubkey,
            identifier,
            relays: [...(getSeenRelays(event) ?? [])].slice(0, 3),
          }),
        })
      }
    }
    return [...result.values()]
  }, [own.events, referenced.events])
  const favoriteRelays = useMemo(
    () => [
      ...new Set(
        feeds?.tags.flatMap(tag => {
          if (tag[0] !== 'relay' || !tag[1]) return []
          try {
            return [normalizeBrowseRelay(tag[1])]
          } catch {
            return []
          }
        }) ?? []
      ),
    ],
    [feeds]
  )

  const resolveSet = useCallback(
    async (input: string, followHints = true) => {
      const pointer = decodeRelaySet(input)
      const safeUrls = (urls: string[]) =>
        urls.flatMap(url => {
          try {
            return [normalizeBrowseRelay(url)]
          } catch {
            return []
          }
        })
      const loader = createAddressLoader(pool, { bufferTime: 0 })
      const load = async (kind: number, author: string, relays: string[], identifier?: string) => {
        try {
          return await lastValueFrom(
            loader({ kind, pubkey: author, identifier, relays }).pipe(
              takeUntil(timer(10000)),
              toArray()
            )
          )
        } catch (cause) {
          throw Object.assign(new Error(i18n.t('relaySource.errors.unavailable')), { cause })
        }
      }
      // Passive URL lookup only uses already configured discovery relays. Hints and the
      // author's outbox are contacted only after the visitor asks to preview a set.
      const cached = store.getReplaceable(30002, pointer.pubkey, pointer.identifier)
      let outbox: string[] = []
      if (followHints && !cached) {
        const lists = await load(10002, pointer.pubkey, discoveryRelays)
        const latest = lists.sort((a, b) => b.created_at - a.created_at)[0]
        outbox = safeUrls(
          latest?.tags.filter(tag => tag[0] === 'r' && tag[2] !== 'read').map(tag => tag[1]) ?? []
        )
      }
      const relays = [
        ...new Set([
          ...(followHints ? safeUrls(pointer.relays ?? []) : []),
          ...outbox,
          ...discoveryRelays,
        ]),
      ].slice(0, 12)
      const events = await load(30002, pointer.pubkey, relays, pointer.identifier)
      const event = [...events, ...(cached ? [cached] : [])].sort(
        (a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id)
      )[0]
      if (!event) throw new Error(i18n.t('relaySource.errors.unavailable'))
      store.add(event)
      return relaySetSource(event)
    },
    [pool, store, discoveryRelays]
  )

  const address = parsed.source?.address
  const approvedAddress = approved?.pubkey === user?.pubkey ? approved?.address : undefined
  useEffect(() => {
    if (
      approvedAddress &&
      resolved &&
      parsed.source &&
      sourceKey(parsed.source) === approvedAddress &&
      sourceKey(resolved) === approvedAddress
    )
      return
    setResolved(null)
    setResolutionError(null)
    if (!address) return
    let cancelled = false
    void resolveSet(address, false)
      .then(source => {
        if (!cancelled) setResolved(source)
      })
      .catch(error => {
        if (!cancelled)
          setResolutionError(error instanceof Error ? error.message : 'Relay set unavailable.')
      })
    return () => {
      cancelled = true
    }
    // A selected preview is already resolved. Keep it stable until the user changes source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, resolveSet, pubkey, approvedAddress])

  const resolvedSource =
    resolved && parsed.source && sourceKey(resolved) === sourceKey(parsed.source) ? resolved : null
  const source =
    resolvedSource && approvedAddress === sourceKey(resolvedSource) ? resolvedSource : parsed.source
  const pendingSource =
    resolvedSource && approvedAddress !== sourceKey(resolvedSource) ? resolvedSource : null
  const selectSource = useCallback(
    (next: BrowseSource | null) => {
      setResolutionError(null)
      setResolved(next?.address ? next : null)
      setApproved(next?.address ? { address: sourceKey(next), pubkey: user?.pubkey } : null)
      const feedPath =
        location.pathname === '/' ||
        location.pathname === '/shorts' ||
        location.pathname.startsWith('/category/')
      navigate({
        pathname: feedPath ? location.pathname : '/',
        search: sourceSearch(next, feedPath ? location.search : ''),
      })
    },
    [navigate, location.pathname, location.search, user?.pubkey]
  )
  const saveSource = useCallback(
    (next: BrowseSource) => {
      const current = readFavorites(storageKey)
      const sources = [...current.filter(source => sourceKey(source) !== sourceKey(next)), next]
      try {
        localStorage.setItem(storageKey, JSON.stringify(sources))
      } catch {
        toast.error(i18n.t('relaySource.errors.storage'))
        return
      }
      setSaved({ key: storageKey, sources })
    },
    [storageKey]
  )
  const removeFavorite = useCallback(
    (key: string) => {
      const sources = readFavorites(storageKey).filter(source => sourceKey(source) !== key)
      try {
        localStorage.setItem(storageKey, JSON.stringify(sources))
      } catch {
        toast.error(i18n.t('relaySource.errors.storage'))
        return
      }
      setSaved({ key: storageKey, sources })
    },
    [storageKey]
  )
  return (
    <RelayBrowsingContext.Provider
      value={{
        source,
        pendingSource,
        selectSource,
        favorites,
        saveSource,
        removeFavorite,
        sets,
        favoriteRelays,
        setsLoading: own.isLoading || referenced.isLoading,
        resolveSet,
        error: parsed.error ?? resolutionError,
      }}
    >
      {children}
    </RelayBrowsingContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRelayBrowsing(): RelayBrowsingValue {
  const value = useContext(RelayBrowsingContext)
  if (!value) throw new Error('RelayBrowsingProvider is required')
  return value
}
