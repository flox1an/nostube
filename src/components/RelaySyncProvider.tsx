import { useRelaySync } from '@/hooks/useRelaySync';

export function RelaySyncProvider({ children }: { children: React.ReactNode }) {
  useRelaySync();
  
  return <>{children}</>;
}
