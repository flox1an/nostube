import { BrowserRouter } from 'react-router-dom'
import { AccountsProvider, EventStoreProvider } from 'applesauce-react'
import { AccountManager } from 'applesauce-accounts'
import { eventStore } from '@/nostr/core'
import { AppProvider } from '@/components/AppProvider'
import { type AppConfig } from '@/contexts/AppContext'
import { PrivateRelaysProvider } from '@/contexts/PrivateRelaysContext'
import { UserRelaysProvider } from '@/contexts/UserRelaysContext'

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
  }

  return (
    <BrowserRouter>
      <AppProvider storageKey="test-app-config" defaultConfig={defaultConfig}>
        <AccountsProvider manager={accountManager}>
          <EventStoreProvider eventStore={eventStore}>
            <UserRelaysProvider>
              <PrivateRelaysProvider>{children}</PrivateRelaysProvider>
            </UserRelaysProvider>
          </EventStoreProvider>
        </AccountsProvider>
      </AppProvider>
    </BrowserRouter>
  )
}

export default TestApp
