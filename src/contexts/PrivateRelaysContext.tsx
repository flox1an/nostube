import type { ISigner } from 'applesauce-signers'
import type { Event, EventTemplate } from 'nostr-tools'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { useEventStore } from 'applesauce-react/hooks'
import { useAppContext } from '@/hooks/useAppContext'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import {
  createPrivateRelayListEvent,
  decryptPrivateRelayList,
  monitorPrivateRelayAuthentication,
  normalizePrivateRelayUrls,
  PRIVATE_RELAY_LIST_KIND,
  publishPrivateEvent,
  type PrivateRelayStatus,
} from '@/nostr/private-relays'
import { useUserRelaysContext } from './UserRelaysContext'

interface PrivateRelaysContextValue {
  relays: string[]
  isLoading: boolean
  error: Error | null
  canConfigure: boolean
  statuses: Record<string, PrivateRelayStatus>
  configure: (relays: readonly string[]) => Promise<void>
  publish: (template: EventTemplate) => Promise<Event>
}

const PrivateRelaysContext = createContext<PrivateRelaysContextValue | undefined>(undefined)

export function PrivateRelaysProvider({ children }: { children: ReactNode }) {
  const { pool } = useAppContext()
  const { user } = useCurrentUser()
  const { writeRelays } = useUserRelaysContext()
  const eventStore = useEventStore()
  const [relays, setRelays] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [statuses, setStatuses] = useState<Record<string, PrivateRelayStatus>>({})
  const signer = user?.signer as ISigner | undefined

  useEffect(() => {
    let cancelled = false
    setRelays([])
    setError(null)

    if (!user?.pubkey || !signer?.nip44 || !writeRelays?.length) {
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    let latestCreatedAt = -1

    const applyRelayList = async (event: Event) => {
      if (event.created_at < latestCreatedAt) return
      latestCreatedAt = event.created_at

      try {
        const nextRelays = await decryptPrivateRelayList(signer, user.pubkey, event)
        if (!cancelled) {
          setRelays(nextRelays)
          setError(null)
        }
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause : new Error('Failed to decrypt private relay list')
          )
        }
      }
    }

    const cached = eventStore.getReplaceable(PRIVATE_RELAY_LIST_KIND, user.pubkey)
    if (cached) void applyRelayList(cached)

    const subscription = pool
      .request(writeRelays, {
        kinds: [PRIVATE_RELAY_LIST_KIND],
        authors: [user.pubkey],
        limit: 1,
      })
      .subscribe({
        next: event => {
          eventStore.add(event)
          const latest = eventStore.getReplaceable(PRIVATE_RELAY_LIST_KIND, user.pubkey)
          if (latest) void applyRelayList(latest)
        },
        error: cause => {
          if (!cancelled) {
            setError(
              cause instanceof Error ? cause : new Error('Failed to load private relay list')
            )
            setIsLoading(false)
          }
        },
        complete: () => {
          if (!cancelled) setIsLoading(false)
        },
      })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [eventStore, pool, signer, user?.pubkey, writeRelays])

  useEffect(() => {
    setStatuses(Object.fromEntries(relays.map(url => [url, 'disconnected' as const])))
    if (!signer || !user?.pubkey) return

    return monitorPrivateRelayAuthentication(
      pool,
      relays,
      signer,
      user.pubkey,
      (url, status, authenticationError) => {
        if (authenticationError) {
          console.error(`[PrivateRelays] Failed to authenticate with ${url}:`, authenticationError)
        }
        setStatuses(current => ({ ...current, [url]: status }))
      }
    )
  }, [pool, relays, signer, user?.pubkey])

  const configure = useCallback(
    async (nextRelays: readonly string[]) => {
      if (!user?.pubkey || !signer?.nip44) {
        throw new Error('A NIP-44 capable signer is required to configure private relays')
      }
      if (!writeRelays?.length) {
        throw new Error('Publish a NIP-65 write relay list before configuring private relays')
      }

      const normalized = normalizePrivateRelayUrls(nextRelays)
      const event = await createPrivateRelayListEvent(signer, user.pubkey, normalized)
      const responses = await pool.publish(writeRelays, event)
      if (!responses.some(response => response.ok)) {
        throw new Error('The private relay list was rejected by every NIP-65 write relay')
      }

      eventStore.add(event)
      setRelays(normalized)
      setError(null)
    },
    [eventStore, pool, signer, user?.pubkey, writeRelays]
  )

  const publish = useCallback(
    async (template: EventTemplate) => {
      if (!signer) throw new Error('User is not logged in')
      const event = await signer.signEvent(template)
      await publishPrivateEvent(pool, relays, event)
      eventStore.add(event)
      return event
    },
    [eventStore, pool, relays, signer]
  )

  const value = useMemo<PrivateRelaysContextValue>(
    () => ({
      relays,
      isLoading,
      error,
      canConfigure: Boolean(user?.pubkey && signer?.nip44 && writeRelays?.length),
      statuses,
      configure,
      publish,
    }),
    [
      configure,
      error,
      isLoading,
      publish,
      relays,
      signer?.nip44,
      statuses,
      user?.pubkey,
      writeRelays?.length,
    ]
  )

  return <PrivateRelaysContext.Provider value={value}>{children}</PrivateRelaysContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePrivateRelays(): PrivateRelaysContextValue {
  const context = useContext(PrivateRelaysContext)
  if (!context) throw new Error('usePrivateRelays must be used within PrivateRelaysProvider')
  return context
}
