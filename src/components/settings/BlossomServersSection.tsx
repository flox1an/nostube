import { useState } from 'react'
import { useAppContext, useUserBlossomServers } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Cog, XIcon } from 'lucide-react'
import { BlossomServerTag } from '@/contexts/AppContext'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const availableTags: BlossomServerTag[] = ['mirror', 'initial upload', 'proxy']

export function BlossomServersSection() {
  const { config, updateConfig } = useAppContext()
  const [newServerUrl, setNewServerUrl] = useState('')
  const userBlossomServers = useUserBlossomServers()

  /*
  Would be good for initial load of the app, but not for the dialog
  useEffect(() => {
    if (
      userBlossomServers.data &&
      (config.blossomServers == undefined || config.blossomServers?.length == 0)
    ) {
      handleResetServers();
    }
  }, [userBlossomServers.data, config.blossomServers]);
*/

  const handleAddServer = () => {
    if (newServerUrl.trim()) {
      const normalizedUrl = normalizeServerUrl(newServerUrl.trim())
      updateConfig(currentConfig => {
        const servers = currentConfig.blossomServers || []
        if (servers.some(s => s.url === normalizedUrl)) return currentConfig
        const name = deriveServerName(normalizedUrl)
        return {
          ...currentConfig,
          blossomServers: [...servers, { url: normalizedUrl, name, tags: [] }],
        }
      })
      setNewServerUrl('')
    }
  }

  const handleRemoveServer = (urlToRemove: string) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      blossomServers: (currentConfig.blossomServers || []).filter(s => s.url !== urlToRemove),
    }))
  }

  const handleResetServers = () => {
    if (userBlossomServers.data && userBlossomServers.data?.length > 0) {
      updateConfig(currentConfig => ({
        ...currentConfig,
        blossomServers: userBlossomServers.data.map(s => ({
          url: s,
          name: s.replace(/^https?:\/\//, ''),
          tags: [],
        })),
      }))
    } else {
      updateConfig(currentConfig => ({
        ...currentConfig,
        blossomServers: [...presetBlossomServers],
      }))
    }
  }

  const handleToggleTag = (serverUrl: string, tag: BlossomServerTag) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      blossomServers: (currentConfig.blossomServers || []).map(s =>
        s.url === serverUrl
          ? {
              ...s,
              tags: s.tags.includes(tag) ? s.tags.filter(t => t !== tag) : [...s.tags, tag],
            }
          : s
      ),
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
        <CardTitle>Blossom Servers</CardTitle>
        <CardDescription>Manage the Blossom servers used for file uploads.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            {(config.blossomServers?.length ?? 0) === 0 ? (
              <p className="text-muted-foreground">
                No Blossom servers configured. Add some below or reset to defaults.
              </p>
            ) : (
              <ScrollArea className="w-full rounded-md border p-4">
                <ul className="space-y-2">
                  {config.blossomServers?.map(server => (
                    <li key={server.url} className="flex items-center justify-between text-sm">
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-2 mt-1">
                          <span>{server.name || server.url}</span>
                          {server.tags.map(tag => (
                            <Badge
                              key={tag}
                              variant="default"
                              className={cn(
                                ['text-xs'],
                                tag == 'mirror'
                                  ? 'bg-blue-500 hover:bg-blue-500/90'
                                  : tag === 'proxy'
                                    ? 'bg-purple-500 hover:bg-purple-500/90'
                                    : 'bg-orange-500 hover:bg-orange-500/90'
                              )}
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Edit tags">
                              <span className="sr-only">Edit tags</span>
                              <Cog className="h-6 w-6" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {availableTags.map(tag => (
                              <DropdownMenuCheckboxItem
                                key={tag}
                                checked={server.tags.includes(tag)}
                                onCheckedChange={() => handleToggleTag(server.url, tag)}
                              >
                                {tag}
                              </DropdownMenuCheckboxItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
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
              placeholder="Add new Blossom server URL (e.g., https://blossom.nostr.build)"
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
