import { useEffect } from 'react'
import { useAppContext } from '@/hooks/useAppContext'
import { useUserRelaysContext } from '@/contexts/UserRelaysContext'
import { type RelayTag } from '@/contexts/AppContext'
import { normalizeRelayUrl } from '@/lib/utils'

/**
 * Keeps the app config relay list in sync with the logged-in account's relay list.
 * Mirrors the BlossomServerSync behavior by merging new relays into config (without removing user additions).
 */
export function UserRelaySync() {
  const { relays } = useUserRelaysContext()
  const { updateConfig } = useAppContext()

  useEffect(() => {
    if (!relays || relays.length === 0) {
      return
    }

    updateConfig(currentConfig => {
      const existingRelays = currentConfig.relays || []
      const dedupedRelays: typeof existingRelays = []
      const seenUrls = new Set<string>()
      let changed = false

      for (const relay of existingRelays) {
        const normalizedUrl = normalizeRelayUrl(relay.url)
        if (!normalizedUrl) continue

        if (relay.url !== normalizedUrl) {
          changed = true
        }

        if (seenUrls.has(normalizedUrl)) {
          changed = true
          continue
        }

        dedupedRelays.push(
          relay.url === normalizedUrl
            ? relay
            : {
                ...relay,
                url: normalizedUrl,
              }
        )
        seenUrls.add(normalizedUrl)
      }

      relays.forEach(userRelay => {
        const normalizedUrl = normalizeRelayUrl(userRelay.url)
        if (!normalizedUrl || seenUrls.has(normalizedUrl)) {
          return
        }

        const tags: RelayTag[] = []
        if (userRelay.read) tags.push('read')
        if (userRelay.write) tags.push('write')
        const normalizedTags = tags.length > 0 ? tags : (['read', 'write'] as RelayTag[])

        dedupedRelays.push({
          url: normalizedUrl,
          name: normalizedUrl.replace(/^wss?:\/\//, ''),
          tags: normalizedTags,
        })
        seenUrls.add(normalizedUrl)
        changed = true
      })

      if (!changed) {
        return currentConfig
      }

      return {
        ...currentConfig,
        relays: dedupedRelays,
      }
    })
  }, [relays, updateConfig])

  return null
}
