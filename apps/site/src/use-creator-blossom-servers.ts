import { useEffect, useState } from 'react'
import { lastValueFrom, toArray } from 'rxjs'
import type { BlossomServer } from '@nostube/core'
import type { NostubeClient } from '@nostube/core/client'
import type { InstanceConfig } from '@nostube/core/instance-config'

/**
 * The creator's own Blossom server list (kind 10063, BUD-03). The player asks these servers for
 * a video's hash when the URLs the event declares fail. Empty until the list is loaded.
 */
export function useCreatorBlossomServers(
  client: NostubeClient,
  config: InstanceConfig
): BlossomServer[] | undefined {
  const [servers, setServers] = useState<BlossomServer[]>()
  const creator = config.startPage?.creator

  useEffect(() => {
    if (!creator) return
    let cancelled = false
    const request = client.relayPool.request(config.videoSources, [
      { kinds: [10063], authors: [creator], limit: 1 },
    ])
    lastValueFrom(request.pipe(toArray()), { defaultValue: [] })
      .then(events => {
        const newest = [...events].sort((a, b) => b.created_at - a.created_at)[0]
        if (cancelled || !newest) return
        const urls = newest.tags
          .filter(tag => tag[0] === 'server' && /^https?:\/\//.test(tag[1] ?? ''))
          .map(tag => tag[1].replace(/\/+$/, ''))
        setServers(
          [...new Set(urls)].map(url => ({
            url,
            name: url.replace(/^https?:\/\//, ''),
            tags: ['mirror' as const],
          }))
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [client, config, creator])

  return servers
}
