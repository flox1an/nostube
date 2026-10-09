import { useState } from 'react'
import type { NostubeClient } from '@nostube/core/client'
import type { InstanceConfig } from '@nostube/core/instance-config'
import type { VideoEvent } from '@nostube/core/video-event'
import { VideoGrid, VideoPlayer } from '@nostube/widgets'
import { useCreatorBlossomServers } from './use-creator-blossom-servers'
import { useCreatorProfile } from './use-creator-profile'
import { useCreatorVideos } from './use-creator-videos'

export interface SiteHomeProps {
  client: NostubeClient
  config: InstanceConfig
}

/** The creator's homepage: profile header, the selected video, the video grid. */
export function SiteHome({ client, config }: SiteHomeProps) {
  const profile = useCreatorProfile(client, config)
  const blossomServers = useCreatorBlossomServers(client, config)
  const { videos, loading, error } = useCreatorVideos(client, config)
  const [selected, setSelected] = useState<VideoEvent | null>(null)

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <header className="flex items-center gap-4">
        {profile?.picture && (
          <img src={profile.picture} alt="" className="h-16 w-16 rounded-full object-cover" />
        )}
        <div>
          <h1 className="text-2xl font-semibold">{profile?.name ?? config.title}</h1>
          {profile?.about && <p className="text-sm text-neutral-500">{profile.about}</p>}
        </div>
      </header>

      {selected && (
        <section className="space-y-2">
          <VideoPlayer video={selected} blossomServers={blossomServers} autoPlay />
          <h2 className="text-lg font-medium">{selected.title}</h2>
          {selected.description && (
            <p className="whitespace-pre-line text-sm text-neutral-500">{selected.description}</p>
          )}
        </section>
      )}

      {error && <p className="text-red-600">Could not load videos: {error}</p>}
      {loading ? (
        <p className="py-12 text-center text-neutral-500">Loading videos…</p>
      ) : (
        <VideoGrid videos={videos} onSelect={setSelected} />
      )}
    </div>
  )
}
