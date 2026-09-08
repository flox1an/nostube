import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { use$, useEventStore } from 'applesauce-react/hooks'
import { ActionsContext } from 'applesauce-react/providers'
import type { Action, ActionRunner } from 'applesauce-actions'
import { MuteListFactory } from 'applesauce-common/factories'
import { getPublicMutedThings } from 'applesauce-common/helpers'
import { kinds, type NostrEvent } from 'nostr-tools'
import { useCurrentUser } from './useCurrentUser'

const STORAGE_PREFIX = 'nostube_muted_pubkeys'
const MUTED_PUBKEYS_CHANGED_EVENT = 'nostube:muted-pubkeys-changed'
const EMPTY: string[] = []

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
 * The muted pubkeys a surface should hide: the published NIP-51 list plus any
 * local mutes made before this client switched to kind 10000 (or while signed
 * out). Local ones keep hiding content until the next mute action migrates them.
 */
export function resolveMutedPubkeys(
  muteList: NostrEvent | undefined,
  localPubkeys: string[]
): string[] {
  const published = muteList ? Array.from(getPublicMutedThings(muteList).pubkeys) : EMPTY
  if (published.length === 0) return localPubkeys
  if (localPubkeys.length === 0) return published
  return Array.from(new Set([...published, ...localPubkeys]))
}

/**
 * Adds and removes pubkeys from the signed-in user's mute list in a single
 * event. Batched on purpose: migrating leftover local mutes one `MuteUser`
 * action at a time would prompt the signer once per pubkey and risk two list
 * versions sharing a `created_at` second, where relays keep only one of them.
 */
function MutateMuteList(add: string[], remove: string[]): Action {
  return async ({ user, signer, publish }) => {
    const [muteList, outboxes] = await Promise.all([
      user.replaceable(kinds.Mutelist).$first(1000, undefined),
      user.outboxes$.$first(1000, undefined),
    ])

    // The factory is immutable: every step returns a new one, so reassign or
    // the edits are dropped and an unchanged list gets signed.
    let factory = muteList ? MuteListFactory.modify(muteList) : MuteListFactory.create()
    if (add.length > 0) factory = factory.addUser(add)
    if (remove.length > 0) factory = factory.removeUser(remove)

    await publish(await factory.sign(signer), outboxes)
  }
}

/**
 * Mute list for the current user. Muted users' videos and comments are hidden
 * across the app (see `useReportedPubkeys`).
 *
 * Signed in, the list is the NIP-51 kind 10000 mute list, so mutes follow the
 * account across devices and other Nostr clients. Signed out there is no signer
 * to publish with, so mutes stay in localStorage until the user logs in and
 * mutes someone, which migrates them into the published list.
 */
export function useMutedPubkeys() {
  const { user } = useCurrentUser()
  const pubkey = user?.pubkey
  const eventStore = useEventStore()
  const actionRunner = useContext(ActionsContext) as ActionRunner | undefined

  const storageKey = useMemo(() => getStorageKey(pubkey), [pubkey])
  const [localPubkeys, setLocalPubkeys] = useState<string[]>(() => readMutedPubkeys(storageKey))

  useEffect(() => {
    setLocalPubkeys(readMutedPubkeys(storageKey))
  }, [storageKey])

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setLocalPubkeys(readMutedPubkeys(storageKey))
      }
    }

    const handleMutedPubkeysChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; pubkeys: string[] }>).detail
      if (detail?.key === storageKey) {
        setLocalPubkeys(detail.pubkeys)
      }
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener(MUTED_PUBKEYS_CHANGED_EVENT, handleMutedPubkeysChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener(MUTED_PUBKEYS_CHANGED_EVENT, handleMutedPubkeysChange)
    }
  }, [storageKey])

  // The store's event loader fetches the list from relays when it is missing.
  const muteList = use$(
    () => (pubkey ? eventStore.replaceable(kinds.Mutelist, pubkey) : undefined),
    [pubkey, eventStore]
  )

  const mutedPubkeys = useMemo(
    () => resolveMutedPubkeys(muteList, localPubkeys),
    [muteList, localPubkeys]
  )

  const mutePubkey = useCallback(
    async (target: string) => {
      const local = readMutedPubkeys(storageKey)

      if (!pubkey || !actionRunner) {
        if (!local.includes(target)) writeMutedPubkeys(storageKey, [...local, target])
        return
      }

      // Carry pre-NIP-51 local mutes into the published list on the way past.
      await actionRunner.run(MutateMuteList, [target, ...local.filter(p => p !== target)], [])
      if (local.length > 0) writeMutedPubkeys(storageKey, [])
    },
    [pubkey, actionRunner, storageKey]
  )

  const unmutePubkey = useCallback(
    async (target: string) => {
      const local = readMutedPubkeys(storageKey)
      if (local.includes(target)) {
        writeMutedPubkeys(
          storageKey,
          local.filter(p => p !== target)
        )
      }

      if (!pubkey || !actionRunner) return
      await actionRunner.run(MutateMuteList, [], [target])
    },
    [pubkey, actionRunner, storageKey]
  )

  return { mutedPubkeys, mutePubkey, unmutePubkey } as const
}
