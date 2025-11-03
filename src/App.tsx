import { ThemeProvider } from '@/providers/theme-provider'
import { AppRouter } from './AppRouter'
import { Suspense } from 'react'
import { AppProvider } from '@/components/AppProvider'
import { AppConfig } from '@/contexts/AppContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AccountsProvider, EventStoreProvider, FactoryProvider } from 'applesauce-react/providers'
import { AccountManager } from 'applesauce-accounts'
import { EventFactory } from 'applesauce-factory'
import { registerCommonAccountTypes } from 'applesauce-accounts/accounts'
import { eventStore } from '@/nostr/core'
import { restoreAccountsToManager } from '@/hooks/useAccountPersistence'
import { useBatchedProfileLoader } from '@/hooks/useBatchedProfiles'
import { presetRelays, presetBlossomServers } from '@/constants/relays'

const defaultConfig: AppConfig = {
  theme: 'dark',
  relays: presetRelays,
  videoType: 'videos',
  blossomServers: [...presetBlossomServers],
  nsfwFilter: 'warning',
  thumbResizeServerUrl: 'https://nostube-imgproxy.apps3.slidestr.net/',
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
