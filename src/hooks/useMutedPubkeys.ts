import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCurrentUser } from './useCurrentUser'

const STORAGE_PREFIX = 'nostube_muted_pubkeys'
const MUTED_PUBKEYS_CHANGED_EVENT = 'nostube:muted-pubkeys-changed'

function getStorageKey(pubkey: string | undefined) {
  return pubkey ? `${STORAGE_PREFIX}:${pubkey}` : `${STORAGE_PREFIX}:anonymous`
}

function readMutedPubkeys(key: string): string[] {
  try {
    const value = localStorage.getItem(key)
    if (!value) return []
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((pubkey): pubkey is string => typeof pubkey === 'string')
      : []
  } catch (error) {
    console.warn(`Failed to load ${key} from localStorage:`, error)
    return []
  }
}

function writeMutedPubkeys(key: string, pubkeys: string[]) {
  localStorage.setItem(key, JSON.stringify(pubkeys))
  window.dispatchEvent(
    new CustomEvent(MUTED_PUBKEYS_CHANGED_EVENT, {
      detail: { key, pubkeys },
    })
  )
}

/**
 * Hook for managing muted pubkeys in localStorage.
 * Muted users' comments and videos are hidden across the app.
 */
export function useMutedPubkeys() {
  const { user } = useCurrentUser()
  const storageKey = useMemo(() => getStorageKey(user?.pubkey), [user?.pubkey])
  const [mutedPubkeys, setMutedPubkeys] = useState<string[]>(() => readMutedPubkeys(storageKey))

  useEffect(() => {
    setMutedPubkeys(readMutedPubkeys(storageKey))
  }, [storageKey])

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setMutedPubkeys(readMutedPubkeys(storageKey))
      }
    }

    const handleMutedPubkeysChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; pubkeys: string[] }>).detail
      if (detail?.key === storageKey) {
        setMutedPubkeys(detail.pubkeys)
      }
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener(MUTED_PUBKEYS_CHANGED_EVENT, handleMutedPubkeysChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener(MUTED_PUBKEYS_CHANGED_EVENT, handleMutedPubkeysChange)
    }
  }, [storageKey])

  const mutePubkey = useCallback(
    (pubkey: string) => {
      setMutedPubkeys(prev => {
        if (prev.includes(pubkey)) return prev
        const next = [...prev, pubkey]
        writeMutedPubkeys(storageKey, next)
        return next
      })
    },
    [storageKey]
  )

  const unmutePubkey = useCallback(
    (pubkey: string) => {
      setMutedPubkeys(prev => {
        const next = prev.filter(mutedPubkey => mutedPubkey !== pubkey)
        writeMutedPubkeys(storageKey, next)
        return next
      })
    },
    [storageKey]
  )

  return { mutedPubkeys, mutePubkey, unmutePubkey } as const
}
