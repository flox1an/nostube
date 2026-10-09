import { useEffect, useState } from 'react'
import { lastValueFrom, toArray } from 'rxjs'
import type { NostubeClient } from '@nostube/core/client'
import type { InstanceConfig } from '@nostube/core/instance-config'

export interface CreatorProfile {
  name?: string
  about?: string
  picture?: string
}

/** The start creator's kind-0 profile from the video sources; null while loading or if absent. */
export function useCreatorProfile(
  client: NostubeClient,
  config: InstanceConfig
): CreatorProfile | null {
  const [profile, setProfile] = useState<CreatorProfile | null>(null)
  const creator = config.startPage?.creator

  useEffect(() => {
    if (!creator) return
    let cancelled = false
    const request = client.relayPool.request(config.videoSources, [
      { kinds: [0], authors: [creator], limit: 1 },
    ])
    lastValueFrom(request.pipe(toArray()), { defaultValue: [] })
      .then(events => {
        const newest = [...events].sort((a, b) => b.created_at - a.created_at)[0]
        if (cancelled || !newest) return
        try {
          const content = JSON.parse(newest.content) as Record<string, unknown>
          const text = (value: unknown) => (typeof value === 'string' ? value : undefined)
          setProfile({
            name: text(content.display_name) || text(content.name),
            about: text(content.about),
            picture: text(content.picture),
          })
        } catch {
          // a malformed profile is treated like a missing one
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [client, config, creator])

  return profile
}
