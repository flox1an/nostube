import { BrowserRouter } from 'react-router-dom'
import { AccountsProvider, EventStoreProvider } from 'applesauce-react'
import { AccountManager } from 'applesauce-accounts'
import { eventStore } from '@/nostr/core'
import { AppProvider } from '@/components/AppProvider'
import { type AppConfig } from '@/contexts/AppContext'
import { defaultResizeServer } from '@/constants/servers'

interface TestAppProps {
  children: React.ReactNode
}

export function TestApp({ children }: TestAppProps) {
  const accountManager = new AccountManager()

  const defaultConfig: AppConfig = {
    theme: 'light',
    relays: [{ url: 'wss://relay.nostr.band', name: 'relay.nostr.band', tags: ['read', 'write'] }],
    videoType: 'videos',
    nsfwFilter: 'warning',
    thumbResizeServerUrl: defaultResizeServer,
  }

  return (
    <BrowserRouter>
      <AppProvider storageKey="test-app-config" defaultConfig={defaultConfig}>
        <AccountsProvider manager={accountManager}>
          <EventStoreProvider eventStore={eventStore}>{children}</EventStoreProvider>
        </AccountsProvider>
      </AppProvider>
    </BrowserRouter>
  )
}

export default TestApp
