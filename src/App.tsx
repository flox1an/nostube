import { ThemeProvider } from "@/providers/theme-provider";
import { AppRouter } from "./AppRouter";
import NostrProvider from '@/components/NostrProvider';
import { NostrLoginProvider } from '@nostrify/react/login';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from 'react';
import { AppProvider } from '@/components/AppProvider';
import { AppConfig } from '@/contexts/AppContext';
import { TooltipProvider } from "@/components/ui/tooltip";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60000,
      gcTime: Infinity,
    },
  },
});

const defaultConfig: AppConfig = {
  theme: "dark",
  relayUrl: "wss://haven.slidestr.net",
};

const presetRelays = [
  { url: 'wss://ditto.pub/relay', name: 'Ditto' },
  { url: 'wss://relay.nostr.band', name: 'Nostr.Band' },
  { url: 'wss://relay.damus.io', name: 'Damus' },
  { url: 'wss://relay.primal.net', name: 'Primal' },
  { url: 'wss://haven.slidestr.net', name: 'Haven' },
];

export function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="nostr-tube-theme">
      <AppProvider storageKey="nostr:app-config" defaultConfig={defaultConfig} presetRelays={presetRelays}>
        <QueryClientProvider client={queryClient}>
          <NostrLoginProvider storageKey='nostr:login'>
            <NostrProvider>
              <TooltipProvider>
                <Suspense>
                  <AppRouter />
                </Suspense>
              </TooltipProvider>
            </NostrProvider>
          </NostrLoginProvider>
        </QueryClientProvider>
      </AppProvider>
    </ThemeProvider>
  );
}