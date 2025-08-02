import { BrowserRouter } from 'react-router-dom';
import { AccountsProvider, EventStoreProvider } from 'applesauce-react';
import { AccountManager } from 'applesauce-accounts';
import { EventStore } from 'applesauce-core';
import { AppProvider } from '@/components/AppProvider';
import { AppConfig } from '@/contexts/AppContext';

interface TestAppProps {
  children: React.ReactNode;
}

export function TestApp({ children }: TestAppProps) {
  const accountManager = new AccountManager();
  const eventStore = new EventStore();

  const defaultConfig: AppConfig = {
    theme: 'light',
    relays: [{ url: 'wss://relay.nostr.band', name: 'relay.nostr.band', tags: ['read', 'write'] }],
    videoType: 'videos',
  };

  return (
    <BrowserRouter>
      <AppProvider storageKey="test-app-config" defaultConfig={defaultConfig}>
        <AccountsProvider manager={accountManager}>
          <EventStoreProvider eventStore={eventStore}>{children}</EventStoreProvider>
        </AccountsProvider>
      </AppProvider>
    </BrowserRouter>
  );
}

export default TestApp;
