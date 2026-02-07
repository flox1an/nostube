import { ThemeProvider } from '@/providers/theme-provider'
import { AppRouter } from './AppRouter'
import { Suspense, useEffect, useRef, useContext } from 'react'
import { AppProvider } from '@/components/AppProvider'
import { type AppConfig } from '@/contexts/AppContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  AccountsProvider,
  EventStoreProvider,
  FactoryProvider,
  AccountsContext,
} from 'applesauce-react/providers'
import { AccountManager } from 'applesauce-accounts'
import { EventFactory } from 'applesauce-core'
import { registerCommonAccountTypes } from 'applesauce-accounts/accounts'
// Import applesauce-common to register EventFactory extensions (note, reaction, etc.)
import 'applesauce-common'
import { eventStore } from '@/nostr/core'
import { restoreAccountsToManager } from '@/hooks/useAccountPersistence'
import { useBatchedProfileLoader } from '@/hooks/useBatchedProfiles'
import { useLoginTimeTracking } from '@/hooks/useLoginTimeTracking'
import { presetRelays, presetBlossomServers, presetCachingServers } from '@/constants/relays'
import { BlossomServerSync } from '@/components/BlossomServerSync'
import { UserRelaysProvider, useUserRelaysContext } from '@/contexts/UserRelaysContext'
import { PresetProvider } from '@/contexts/PresetContext'
import { useAppContext } from '@/hooks'
import { UserRelaySync } from '@/components/UserRelaySync'
import { OnboardingDialog } from '@/components/OnboardingDialog'
import { UploadManagerProvider } from '@/providers/UploadManagerProvider'
import { WalletProvider } from '@/contexts/WalletContext'
import { defaultResizeServer } from '@/constants/servers'

export { defaultResizeServer }

const defaultConfig: AppConfig = {
  theme: 'dark',
  relays: presetRelays,
  videoType: 'videos',
  blossomServers: [...presetBlossomServers],
  cachingServers: [...presetCachingServers],
  nsfwFilter: 'hide',
  thumbResizeServerUrl: defaultResizeServer,
  media: {
    failover: {
      enabled: true,
      discovery: {
        enabled: false, // Opt-in for now, can be enabled by default later
        timeout: 10000, // 10 seconds
        maxResults: 20,
      },
      validation: {
        enabled: false, // Opt-in for now, validation is done on-demand
        timeout: 5000, // 5 seconds
        parallelRequests: 5,
      },
    },
    proxy: {
      enabled: true,
      includeOrigin: true,
      imageSizes: [
        { width: 320, height: 180 },
        { width: 640, height: 360 },
        { width: 1280, height: 720 },
      ],
    },
  },
}

// Create account manager for applesauce
const accountManager = new AccountManager()

registerCommonAccountTypes(accountManager)

const factory = new EventFactory({
  // use the active signer from the account manager
  signer: accountManager.signer,
})

/**
 * Component that restores persisted accounts on mount
 * Uses useEffect to ensure it runs after React is ready
 */
function AccountRestoreInit() {
  const manager = useContext(AccountsContext)
  const hasRestored = useRef(false)

  useEffect(() => {
    // Only restore once
    if (hasRestored.current || !manager) return
    hasRestored.current = true

    restoreAccountsToManager(manager).catch(error => {
      console.error('[AccountRestoreInit] Failed to restore accounts:', error)
    })
  }, [manager])

  return null
}

function BatchedProfileLoaderInit() {
  useBatchedProfileLoader()
  return null
}

function LoginTimeTrackingInit() {
  useLoginTimeTracking()
  return null
}

function RelayPoolSync() {
  const { config, pool } = useAppContext()
  const { readRelays, writeRelays } = useUserRelaysContext()

  useEffect(() => {
    const userRelaySet = new Set<string>([...(readRelays ?? []), ...(writeRelays ?? [])])

    const configRelays = config.relays.map(relay => relay.url)
    const effectiveRelays = userRelaySet.size > 0 ? Array.from(userRelaySet) : configRelays

    pool.group(effectiveRelays)
  }, [config.relays, pool, readRelays, writeRelays])

  return null
}

export function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="nostr-tube-theme">
      <AppProvider
        storageKey="nostr:app-config"
        defaultConfig={defaultConfig}
        presetRelays={presetRelays}
      >
        <AccountsProvider manager={accountManager}>
          <EventStoreProvider eventStore={eventStore}>
            <FactoryProvider factory={factory}>
              <PresetProvider>
                <UserRelaysProvider>
                  <UploadManagerProvider>
                    <WalletProvider>
                      <TooltipProvider>
                        <AccountRestoreInit />
                        <UserRelaySync />
                        <RelayPoolSync />
                        <BatchedProfileLoaderInit />
                        <LoginTimeTrackingInit />
                        <BlossomServerSync />
                        <OnboardingDialog />
                        <Suspense>
                          <AppRouter />
                        </Suspense>
                      </TooltipProvider>
                    </WalletProvider>
                  </UploadManagerProvider>
                </UserRelaysProvider>
              </PresetProvider>
            </FactoryProvider>
          </EventStoreProvider>
        </AccountsProvider>
      </AppProvider>
    </ThemeProvider>
  )
}
