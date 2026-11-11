import { useEffect, useState } from 'react'
import { useEventStore } from 'applesauce-react/hooks'
import { kinds } from 'nostr-tools'
import { getProfileContent } from 'applesauce-core/helpers/profile'
import { lnurlFromProfile, resolveZapEndpoint, type ZapEndpoint } from '@nostube/core/lnurl-pay'
import { requestProfile } from '@nostube/widgets/hooks/useBatchedProfiles'

/** Recipient pubkey -> LNURL endpoint from their own profile, for zaps that can be verified. */
export function useZapEndpoints(recipients: string[]): ReadonlyMap<string, ZapEndpoint> {
  const eventStore = useEventStore()
  const [endpoints, setEndpoints] = useState<ReadonlyMap<string, ZapEndpoint>>(() => new Map())
  const key = recipients.join(',')

  useEffect(() => {
    const controller = new AbortController()
    const subscriptions = (key ? key.split(',') : []).map(pubkey => {
      requestProfile(pubkey)
      return eventStore.replaceable(kinds.Metadata, pubkey).subscribe(profile => {
        const lnurl = profile && lnurlFromProfile(getProfileContent(profile) ?? {})
        if (!lnurl) return
        resolveZapEndpoint(lnurl, controller.signal)
          .then(endpoint => {
            if (endpoint.nostrPubkey && !controller.signal.aborted)
              setEndpoints(prev => new Map(prev).set(pubkey, endpoint))
          })
          .catch(() => {})
      })
    })
    return () => {
      controller.abort()
      subscriptions.forEach(subscription => subscription.unsubscribe())
    }
  }, [eventStore, key])

  return endpoints
}
