import { ThemeProvider } from '@/providers/theme-provider';
import { AppRouter } from './AppRouter';
import { Suspense } from 'react';
import { AppProvider } from '@/components/AppProvider';
import { AppConfig, Relay } from '@/contexts/AppContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AccountsProvider, EventStoreProvider, FactoryProvider } from 'applesauce-react/providers';
import { AccountManager } from 'applesauce-accounts';
import { EventStore } from 'applesauce-core/event-store';
import { EventFactory } from 'applesauce-factory';
import { registerCommonAccountTypes } from 'applesauce-accounts/accounts';
import { VideoTimelineProvider } from '@/contexts/VideoTimelineContext';

export const presetRelays: Relay[] = [
  { url: 'wss://ditto.pub/relay', name: 'Ditto', tags: ['read'] },
  { url: 'wss://relay.nostr.band', name: 'Nostr.Band', tags: ['read'] },
  { url: 'wss://relay.damus.io', name: 'Damus', tags: ['read'] },
  { url: 'wss://relay.primal.net', name: 'Primal', tags: ['read'] },
  { url: 'wss://nos.lol/', name: 'nos.lol', tags: ['read'] },
];

const presetBlossomServers: BlossomServer[] = [];

const defaultConfig: AppConfig = {
  theme: 'dark',
  relays: presetRelays,
  videoType: 'videos',
  blossomServers: [...presetBlossomServers],
};

// Create account manager and event store for applesauce
const accountManager = new AccountManager();

registerCommonAccountTypes(accountManager);

const eventStore = new EventStore();
const factory = new EventFactory({
  // use the active signer from the account manager
  signer: accountManager.signer,
});

export function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="nostr-tube-theme">
      <AppProvider storageKey="nostr:app-config" defaultConfig={defaultConfig} presetRelays={presetRelays}>
        <AccountsProvider manager={accountManager}>
          <EventStoreProvider eventStore={eventStore}>
            <FactoryProvider factory={factory}>
              <VideoTimelineProvider>
                <TooltipProvider>
                  <Suspense>
                    <AppRouter />
                  </Suspense>
                </TooltipProvider>
              </VideoTimelineProvider>
            </FactoryProvider>
          </EventStoreProvider>
        </AccountsProvider>
      </AppProvider>
    </ThemeProvider>
  );
}
