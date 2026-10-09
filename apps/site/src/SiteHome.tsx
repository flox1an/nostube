import { Link, Navigate, Route, Routes, useMatch } from 'react-router-dom'
import type { NostubeClient } from '@nostube/core/client'
import type { InstanceConfig } from '@nostube/core/instance-config'
import { InstanceProviders } from '@nostube/widgets/instance-providers'
import { GridPage } from './GridPage'
import { VideoView } from './VideoView'
import { useAgeGate } from './use-age-gate'
import { useCreatorProfile } from './use-creator-profile'

export interface SiteHomeProps {
  client: NostubeClient
  config: InstanceConfig
}

/** The creator's site: the header, then the video grid or one video, each at its own URL. */
export function SiteHome({ client, config }: SiteHomeProps) {
  return (
    <InstanceProviders client={client} config={config}>
      <Site client={client} config={config} />
    </InstanceProviders>
  )
}

function Site({ client, config }: SiteHomeProps) {
  const profile = useCreatorProfile(client, config)
  const gate = useAgeGate()
  // A video page has its own breadcrumb instead of the large header.
  const onVideoPage = useMatch('/v/:id') !== null
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-3 sm:space-y-6 sm:py-6">
      {!onVideoPage && (
        <header>
          <Link to="/" className="flex items-center gap-4">
            {profile?.picture && (
              <img src={profile.picture} alt="" className="h-16 w-16 rounded-full object-cover" />
            )}
            <div>
              <h1 className="text-2xl font-semibold">{config.title}</h1>
              {config.site.tagline && (
                <p className="text-sm text-muted-foreground">{config.site.tagline}</p>
              )}
            </div>
          </Link>
        </header>
      )}
      <Routes>
        <Route path="/" element={<GridPage config={config} gate={gate} />} />
        <Route
          path="/v/:id"
          element={
            <VideoView
              config={config}
              gate={gate}
              authorName={profile?.name}
              picture={profile?.picture}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
