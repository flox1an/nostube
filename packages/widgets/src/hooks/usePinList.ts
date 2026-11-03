import { useEffect, useMemo, useState } from 'react'
import { use$, useEventStore } from 'applesauce-react/hooks'
import type { RelayPool } from 'applesauce-relay'
import { loadPinList, newestPinList, parsePinRefs } from '@nostube/core/pin-list'

/** Load before editing: a failed request must never become an empty list to overwrite. */
export function usePinList(pool: RelayPool, relays: string[], pubkey: string | undefined) {
  const store = useEventStore()
  const key = `${pubkey ?? ''}:${relays.join(',')}`
  const [status, setStatus] = useState({ key: '', ready: false, error: '' })
  const filters = useMemo(() => [{ kinds: [10001], authors: pubkey ? [pubkey] : [] }], [pubkey])
  const events = use$(
    () => (pubkey ? store.timeline(filters) : undefined),
    [store, filters, pubkey]
  )
  useEffect(() => {
    let cancelled = false
    if (!pubkey) return
    loadPinList(pool, relays, pubkey).then(
      event => {
        if (cancelled) return
        if (event) store.add(event)
        setStatus({ key, ready: true, error: '' })
      },
      error => {
        if (!cancelled) setStatus({ key, ready: false, error: String(error) })
      }
    )
    return () => {
      cancelled = true
    }
  }, [pool, store, key, pubkey, relays])
  const event = newestPinList(events ?? [])
  const refs = useMemo(
    () => (event ? parsePinRefs(event.tags).map(ref => ref.address ?? ref.id!) : []),
    [event]
  )
  return {
    event,
    refs,
    ready: status.key === key && status.ready,
    error: status.key === key ? status.error : '',
  }
}
