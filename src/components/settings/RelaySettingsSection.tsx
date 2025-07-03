import { useState } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { XIcon } from 'lucide-react';
import { mergeRelays } from '@/lib/utils';
import { presetRelays } from '@/App';
import { useUserRelays } from '@/hooks/useUserRelays';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function RelaySettingsSection() {
  const { config, updateConfig } = useAppContext();
  const [newRelayUrl, setNewRelayUrl] = useState('');

  const { user } = useCurrentUser();
  const userRelays = useUserRelays(user?.pubkey);

  const handleAddRelay = () => {
    if (newRelayUrl.trim()) {
      const normalizedUrl = normalizeRelayUrl(newRelayUrl.trim());
      updateConfig((currentConfig) => ({
        ...currentConfig,
        relays: mergeRelays([[normalizedUrl], currentConfig.relays]),
      }));
      setNewRelayUrl('');
    }
  };

  const handleRemoveRelay = (urlToRemove: string) => {
    updateConfig((currentConfig) => ({
      ...currentConfig,
      relays: currentConfig.relays.filter(url => url !== urlToRemove),
    }));
  };

  const handleResetRelays = () => {
    updateConfig((currentConfig) => ({
      ...currentConfig,
      relays: userRelays.data ? userRelays.data.map(r => r.url) :  presetRelays.map(r => r.url),
    }));
  };

  const normalizeRelayUrl = (url: string): string => {
    const trimmed = url.trim();
    if (!trimmed) return trimmed;
    if (trimmed.includes('://')) {
      return trimmed;
    }
    return `wss://${trimmed}`;
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Relays</CardTitle>
        <CardDescription>Manage the Nostr relays your client connects to.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            {config.relays.length === 0 ? (
              <p className="text-muted-foreground">No relays configured. Add some below or reset to defaults.</p>
            ) : (
              <ScrollArea className="w-full rounded-md border p-4">
                <ul className="space-y-2">
                  {config.relays.map((relayUrl) => (
                    <li key={relayUrl} className="flex items-center justify-between text-sm">
                      <span>{relayUrl}</span>
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveRelay(relayUrl)}>
                        <XIcon className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </div>

          <div className="flex w-full space-x-2">
            <Input
              placeholder="Add new relay URL (e.g., wss://relay.damus.io)"
              value={newRelayUrl}
              onChange={(e) => setNewRelayUrl(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAddRelay();
                }
              }}
            />
            <Button onClick={handleAddRelay}>Add Relay</Button>
          </div>

          <Button variant="outline" onClick={handleResetRelays}>
            Reset to Default Relays
          </Button>
        </div>
      </CardContent>
    </Card>
  );
} 