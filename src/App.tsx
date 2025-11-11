import { ThemeProvider } from '@/providers/theme-provider'
import { AppRouter } from './AppRouter'
import { Suspense } from 'react'
import { AppProvider } from '@/components/AppProvider'
import { type AppConfig } from '@/contexts/AppContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AccountsProvider, EventStoreProvider, FactoryProvider } from 'applesauce-react/providers'
import { AccountManager } from 'applesauce-accounts'
import { EventFactory } from 'applesauce-factory'
import { registerCommonAccountTypes } from 'applesauce-accounts/accounts'
import { eventStore } from '@/nostr/core'
import { restoreAccountsToManager } from '@/hooks/useAccountPersistence'
import { useBatchedProfileLoader } from '@/hooks/useBatchedProfiles'
import { presetRelays, presetBlossomServers } from '@/constants/relays'

export const defaultResizeServer = 'https://imgproxy.nostu.be/'

const defaultConfig: AppConfig = {
  theme: 'dark',
  relays: presetRelays,
  videoType: 'videos',
  blossomServers: [...presetBlossomServers],
  nsfwFilter: 'warning',
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

// Restore accounts from localStorage on initialization
restoreAccountsToManager(accountManager).catch(() => {
  // Failed to restore accounts - user will need to login again
})

// Account persistence will be handled in login actions and account switcher

const factory = new EventFactory({
  // use the active signer from the account manager
  signer: accountManager.signer,
})

// Account persistence is handled directly in login actions and account switcher
// No need for a separate listener component

function BatchedProfileLoaderInit() {
  useBatchedProfileLoader()
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
              <TooltipProvider>
                <BatchedProfileLoaderInit />
                <Suspense>
                  <AppRouter />
                </Suspense>
              </TooltipProvider>
            </FactoryProvider>
          </EventStoreProvider>
        </AccountsProvider>
      </AppProvider>
    </ThemeProvider>
  )
}
