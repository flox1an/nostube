import { useState } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { XIcon } from 'lucide-react';

const presetBlossomServers = [
  'https://temp-st.apps2.slidestr.net',
];

export function BlossomServersSection() {
  const { config, updateConfig } = useAppContext();
  const [newServerUrl, setNewServerUrl] = useState('');

  const handleAddServer = () => {
    if (newServerUrl.trim()) {
      const normalizedUrl = normalizeServerUrl(newServerUrl.trim());
      updateConfig((currentConfig) => ({
        ...currentConfig,
        blossomServers: Array.from(new Set([...(currentConfig.blossomServers || []), normalizedUrl])),
      }));
      setNewServerUrl('');
    }
  };

  const handleRemoveServer = (urlToRemove: string) => {
    updateConfig((currentConfig) => ({
      ...currentConfig,
      blossomServers: (currentConfig.blossomServers || []).filter(url => url !== urlToRemove),
    }));
  };

  const handleResetServers = () => {
    updateConfig((currentConfig) => ({
      ...currentConfig,
      blossomServers: [...presetBlossomServers],
    }));
  };

  const normalizeServerUrl = (url: string): string => {
    const trimmed = url.trim();
    if (!trimmed) return trimmed;
    if (trimmed.startsWith('http')) {
      return trimmed;
    }
    return `https://${trimmed}`;
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Blossom Servers</CardTitle>
        <CardDescription>Manage the Blossom servers used for file uploads.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium">Current Blossom Servers</h3>
            {(config.blossomServers?.length ?? 0) === 0 ? (
              <p className="text-muted-foreground">No Blossom servers configured. Add some below or reset to defaults.</p>
            ) : (
              <ScrollArea className="w-full rounded-md border p-4">
                <ul className="space-y-2">
                  {config.blossomServers?.map((serverUrl) => (
                    <li key={serverUrl} className="flex items-center justify-between text-sm">
                      <span>{serverUrl}</span>
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveServer(serverUrl)}>
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
              placeholder="Add new Blossom server URL (e.g., https://blossom.nostr.build)"
              value={newServerUrl}
              onChange={(e) => setNewServerUrl(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAddServer();
                }
              }}
            />
            <Button onClick={handleAddServer}>Add Server</Button>
          </div>

          <Button variant="outline" onClick={handleResetServers}>
            Reset to Default Servers
          </Button>
        </div>
      </CardContent>
    </Card>
  );
} 