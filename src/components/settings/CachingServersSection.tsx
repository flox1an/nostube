import { useState } from 'react'
import { useAppContext } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { XIcon } from 'lucide-react'
import { presetCachingServers } from '@/constants/relays'

export function CachingServersSection() {
  const { config, updateConfig } = useAppContext()
  const [newServerUrl, setNewServerUrl] = useState('')

  const handleAddServer = () => {
    if (newServerUrl.trim()) {
      const normalizedUrl = normalizeServerUrl(newServerUrl.trim())
      updateConfig(currentConfig => {
        const servers = currentConfig.cachingServers || []
        if (servers.some(s => s.url === normalizedUrl)) return currentConfig
        const name = deriveServerName(normalizedUrl)
        return {
          ...currentConfig,
          cachingServers: [...servers, { url: normalizedUrl, name }],
        }
      })
      setNewServerUrl('')
    }
  }

  const handleRemoveServer = (urlToRemove: string) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      cachingServers: (currentConfig.cachingServers || []).filter(s => s.url !== urlToRemove),
    }))
  }

  const handleResetServers = () => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      cachingServers: [...presetCachingServers],
    }))
  }

  const normalizeServerUrl = (url: string): string => {
    const trimmed = url.trim()
    if (!trimmed) return trimmed
    if (trimmed.startsWith('http')) {
      return trimmed
    }
    return `https://${trimmed}`
  }

  const deriveServerName = (url: string): string => {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Media Caching Servers</CardTitle>
        <CardDescription>
          Manage servers used for caching and proxying video content. These servers provide faster
          playback and reduce load on origin servers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            {(config.cachingServers?.length ?? 0) === 0 ? (
              <p className="text-muted-foreground">
                No caching servers configured. Add some below or reset to defaults.
              </p>
            ) : (
              <ScrollArea className="w-full rounded-md border p-4">
                <ul className="space-y-2">
                  {config.cachingServers?.map(server => (
                    <li key={server.url} className="flex items-center justify-between text-sm">
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-2 mt-1">
                          <span>{server.name || server.url}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveServer(server.url)}
                        >
                          <XIcon className="h-6 w-6" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </div>

          <div className="flex w-full space-x-2">
            <Input
              placeholder="Add new caching server URL (e.g., https://cache.example.com)"
              value={newServerUrl}
              onChange={e => setNewServerUrl(e.target.value)}
              onKeyPress={e => {
                if (e.key === 'Enter') {
                  handleAddServer()
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
  )
}
