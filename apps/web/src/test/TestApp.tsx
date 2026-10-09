import { BrowserRouter } from 'react-router-dom'
import { AccountsProvider, EventStoreProvider } from 'applesauce-react'
import { AccountManager } from 'applesauce-accounts'
import { client, eventStore } from '@/nostr/core'
import { AppProvider } from '@/components/AppProvider'
import { type AppConfig } from '@nostube/core'
import { PrivateRelaysProvider } from '@/contexts/PrivateRelaysContext'
import { UserRelaysProvider } from '@/contexts/UserRelaysContext'
import { TimelineProvider } from '@nostube/widgets/timeline'

// Tests need no viewer-specific filtering.
const timeline = { client, policy: { getAllMissingVideos: () => ({}) } }

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
              <PrivateRelaysProvider>
                <TimelineProvider value={timeline}>{children}</TimelineProvider>
              </PrivateRelaysProvider>
            </UserRelaysProvider>
          </EventStoreProvider>
        </AccountsProvider>
      </AppProvider>
    </BrowserRouter>
  )
}

export default TestApp
