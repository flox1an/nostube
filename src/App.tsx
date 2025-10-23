import { ThemeProvider } from '@/providers/theme-provider'
import { AppRouter } from './AppRouter'
import { Suspense } from 'react'
import { AppProvider } from '@/components/AppProvider'
import { AppConfig, Relay } from '@/contexts/AppContext'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AccountsProvider, EventStoreProvider, FactoryProvider } from 'applesauce-react/providers'
import { AccountManager } from 'applesauce-accounts'
import { EventFactory } from 'applesauce-factory'
import { registerCommonAccountTypes } from 'applesauce-accounts/accounts'
import { eventStore } from '@/nostr/core'
import { RelaySyncProvider } from '@/components/RelaySyncProvider'

export const presetRelays: Relay[] = [
  { url: 'wss://ditto.pub/relay', name: 'Ditto', tags: ['read'] },
  { url: 'wss://relay.nostr.band', name: 'Nostr.Band', tags: ['read'] },
  { url: 'wss://relay.damus.io', name: 'Damus', tags: ['read'] },
  { url: 'wss://relay.primal.net', name: 'Primal', tags: ['read'] },
  { url: 'wss://nos.lol/', name: 'nos.lol', tags: ['read'] },
]

const presetBlossomServers: BlossomServer[] = []

const defaultConfig: AppConfig = {
  theme: 'dark',
  relays: presetRelays,
  videoType: 'videos',
  blossomServers: [...presetBlossomServers],
}

// Create account manager for applesauce
const accountManager = new AccountManager()

registerCommonAccountTypes(accountManager)

const factory = new EventFactory({
  // use the active signer from the account manager
  signer: accountManager.signer,
})

// Initialize relay pool with default relays
console.log(
  'Initializing relay pool with relays:',
  presetRelays.map(r => r.url)
)

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
              <RelaySyncProvider>
                <TooltipProvider>
                  <Suspense>
                    <AppRouter />
                  </Suspense>
                </TooltipProvider>
              </RelaySyncProvider>
            </FactoryProvider>
          </EventStoreProvider>
        </AccountsProvider>
      </AppProvider>
    </ThemeProvider>
  )
}
