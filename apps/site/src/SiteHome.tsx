import { useContext, useEffect, useRef } from 'react'
import { Link, Navigate, Route, Routes, useMatch } from 'react-router-dom'
import { AccountsContext, AccountsProvider } from 'applesauce-react/providers'
import type { AccountManager } from 'applesauce-accounts'
import type { NostubeClient } from '@nostube/core/client'
import type { InstanceConfig } from '@nostube/core/instance-config'
import { InstanceProviders } from '@nostube/widgets/instance-providers'
import { restoreAccountsToManager } from '@nostube/widgets/hooks/useAccountPersistence'
import { useBatchedProfileLoader } from '@nostube/widgets/hooks/useBatchedProfiles'
import { AuthArea } from './AuthArea'
import { GridPage } from './GridPage'
import { VideoView } from './VideoView'
import { useAgeGate } from './use-age-gate'
import { useCreatorProfile } from './use-creator-profile'

export interface SiteHomeProps {
  client: NostubeClient
  config: InstanceConfig
  accountManager: AccountManager
}

/** The creator's site: the header, then the video grid or one video, each at its own URL. */
export function SiteHome({ client, config, accountManager }: SiteHomeProps) {
  return (
    <InstanceProviders client={client} config={config}>
      <AccountsProvider manager={accountManager}>
        <Site client={client} config={config} />
      </AccountsProvider>
    </InstanceProviders>
  )
}

/** Restores persisted visitor accounts once on mount. */
function AccountRestoreInit() {
  const manager = useContext(AccountsContext)
  const hasRestored = useRef(false)
  useEffect(() => {
    if (hasRestored.current || !manager) return
    hasRestored.current = true
    restoreAccountsToManager(manager).catch(error => {
      console.error('[Site] Failed to restore accounts:', error)
    })
  }, [manager])
  return null
}

function Site({ client, config }: { client: NostubeClient; config: InstanceConfig }) {
  const profile = useCreatorProfile(client, config)
  const gate = useAgeGate()
  useBatchedProfileLoader()
  // A video page has its own breadcrumb instead of the large header.
  const onVideoPage = useMatch('/v/:id') !== null
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-3 sm:space-y-6 sm:py-6">
      <AccountRestoreInit />
      {!onVideoPage && (
        <header className="flex items-start justify-between gap-4">
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
          <AuthArea client={client} relays={config.interactionRelays} />
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
