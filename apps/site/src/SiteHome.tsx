import { useContext, useEffect, useRef } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useMatch } from 'react-router-dom'
import { AccountsContext, AccountsProvider } from 'applesauce-react/providers'
import type { AccountManager } from 'applesauce-accounts'
import type { NostubeClient } from '@nostube/core/client'
import { SITE_PAGES, type InstanceConfig } from '@nostube/core/instance-config'
import { InstanceProviders } from '@nostube/widgets/instance-providers'
import { restoreAccountsToManager } from '@nostube/widgets/hooks/useAccountPersistence'
import { useBatchedProfileLoader } from '@nostube/widgets/hooks/useBatchedProfiles'
import { AuthArea } from './AuthArea'
import { GridPage, SearchBox, SearchPage } from './GridPage'
import { SiteFooter, SitePage } from './SitePage'
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
  // The banner would push a video below the fold; the header (title, sign-in) stays everywhere.
  const onVideoPage = useMatch('/v/:id') !== null
  const search = config.search.mode === 'local'
  // A new page shows its own query in the box (empty outside `/search`).
  const { key: pageKey } = useLocation()
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-3 sm:space-y-6 sm:py-6">
      <AccountRestoreInit />
      {!onVideoPage && config.site.banner && (
        // Edge to edge on a phone, like the grid below it.
        <img
          src={config.site.banner}
          alt=""
          className="-mx-4 aspect-[3/1] w-[calc(100%+2rem)] max-w-none object-cover sm:mx-0 sm:aspect-[5/1] sm:w-full sm:rounded-lg"
        />
      )}
      <header className="flex items-start justify-between gap-4">
        <Link to="/" className="flex min-w-0 items-center gap-4">
          {config.site.logo ? (
            <img
              src={config.site.logo}
              alt=""
              className="h-16 w-auto max-w-[40vw] shrink-0 object-contain sm:max-w-xs"
            />
          ) : profile?.picture ? (
            <img src={profile.picture} alt="" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <span
              aria-hidden
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted text-2xl font-semibold text-muted-foreground"
            >
              {[...config.title][0]?.toUpperCase()}
            </span>
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
      {search && <SearchBox key={pageKey} />}
      <Routes>
        <Route path="/" element={<GridPage config={config} gate={gate} />} />
        <Route path="/t/:tag" element={<GridPage config={config} gate={gate} />} />
        {search && <Route path="/search" element={<SearchPage config={config} gate={gate} />} />}
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
        {SITE_PAGES.map(page => (
          <Route key={page} path={`/${page}`} element={<SitePage config={config} page={page} />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SiteFooter config={config} />
    </div>
  )
}
