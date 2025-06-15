import { ThemeProvider } from "@/providers/theme-provider";
import { AppRouter } from "./AppRouter";
import NostrProvider from '@/components/NostrProvider';
import { NostrLoginProvider } from '@nostrify/react/login';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Suspense } from 'react';
import { AppProvider } from '@/components/AppProvider';
import { AppConfig } from '@/contexts/AppContext';
import { TooltipProvider } from "@/components/ui/tooltip";
import { VideoCacheProvider } from '@/contexts/VideoCacheContext';

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
  videoType: "videos",
};

const presetRelays = [
  { url: 'wss://ditto.pub/relay', name: 'Ditto' },
  { url: 'wss://relay.nostr.band', name: 'Nostr.Band' },
  { url: 'wss://relay.damus.io', name: 'Damus' },
  { url: 'wss://relay.primal.net', name: 'Primal' },
  { url: 'wss://nos.lol/', name: 'nos.lol' },
  { url: "wss://haven.slidestr.net", name: 'haven' },
];

export function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="nostr-tube-theme">
      <QueryClientProvider client={queryClient}>
        {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
        <NostrLoginProvider storageKey='nostr:login'>
          <NostrProvider relayUrl={defaultConfig.relayUrl} presetRelays={presetRelays}>
            <AppProvider storageKey="nostr:app-config" defaultConfig={defaultConfig} presetRelays={presetRelays}>
              <VideoCacheProvider>
                <TooltipProvider>
                  <Suspense>
                    <AppRouter />
                  </Suspense>
                </TooltipProvider>
              </VideoCacheProvider>
            </AppProvider>
          </NostrProvider>
        </NostrLoginProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}