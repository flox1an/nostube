import { useEffect } from 'react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useUserBlossomServers } from '@/hooks/useUserBlossomServers'
import { useAppContext } from '@/hooks/useAppContext'
import { mergeProfileServers, normalizeBlossomServers } from '@/lib/blossom-servers'

const signatureKey = (pubkey: string) => `nostube:blossom-profile-sync:${pubkey}`

/**
 * Brings servers from the user's kind 10063 list (NIP-B7 / BUD-03) into the local list. It merges
 * only when the profile list changed since the last merge, so removing a server locally sticks.
 * Must be rendered inside the AccountsProvider hierarchy.
 */
export function BlossomServerSync() {
  const { user } = useCurrentUser()
  const { data: profileUrls } = useUserBlossomServers()
  const { updateConfig } = useAppContext()

  useEffect(() => {
    const pubkey = user?.pubkey
    if (!pubkey || profileUrls.length === 0) return
    const key = signatureKey(pubkey)
    const lastSignature = localStorage.getItem(key)
    let signature: string | undefined
    // The updater stays pure (it may run twice); the fingerprint is stored afterwards.
    updateConfig(currentConfig => {
      const merged = mergeProfileServers(
        normalizeBlossomServers(currentConfig.blossomServers),
        profileUrls,
        lastSignature
      )
      if (!merged) return currentConfig
      signature = merged.signature
      return { ...currentConfig, blossomServers: merged.servers }
    })
    if (signature) localStorage.setItem(key, signature)
  }, [user?.pubkey, profileUrls, updateConfig])

  return null
}
