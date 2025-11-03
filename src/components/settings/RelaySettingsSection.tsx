import { useState } from 'react'
import { useAppContext, useUserRelays, useCurrentUser } from '@/hooks'
import { RelayTag } from '@/contexts/AppContext'
import { normalizeRelayUrl } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { XIcon, Cog } from 'lucide-react'
import { presetRelays } from '@/constants/relays'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import { Badge } from '../ui/badge'

export function RelaySettingsSection() {
  const { config, updateConfig } = useAppContext()
  const [newRelayUrl, setNewRelayUrl] = useState('')

  const { user } = useCurrentUser()
  const userRelays = useUserRelays(user?.pubkey)

  const handleAddRelay = () => {
    if (newRelayUrl.trim()) {
      const normalizedUrl = normalizeRelayUrl(newRelayUrl.trim())
      updateConfig(currentConfig => {
        const relays = currentConfig.relays || []
        if (relays.some(r => r.url === normalizedUrl)) return currentConfig
        return {
          ...currentConfig,
          relays: [
            ...relays,
            {
              url: normalizedUrl,
              name: normalizedUrl.replace(/^wss:\/\//, '').replace(/\/$/, ''),
              tags: ['read', 'write'] as RelayTag[],
            },
          ],
        }
      })
      setNewRelayUrl('')
    }
  }

  const handleRemoveRelay = (urlToRemove: string) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      relays: currentConfig.relays.filter(r => r.url !== urlToRemove),
    }))
  }

  const handleResetRelays = () => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      relays: userRelays.data
        ? userRelays.data.map(r => ({
            url: r.url,
            name: r.url.replace(/^wss:\/\//, '').replace(/\/$/, ''),
            tags: ['read', 'write'] as RelayTag[],
          }))
        : presetRelays.map(r => ({
            url: r.url,
            name: r.name || r.url.replace(/^wss:\/\//, ''),
            tags: ['read', 'write'] as RelayTag[],
          })),
    }))
  }

  const handleToggleTag = (relayUrl: string, tag: RelayTag) => {
    updateConfig(currentConfig => ({
      ...currentConfig,
      relays: currentConfig.relays.map(r =>
        r.url === relayUrl
          ? { ...r, tags: r.tags.includes(tag) ? r.tags.filter(t => t !== tag) : [...r.tags, tag] }
          : r
      ),
    }))
  }

  const availableTags: RelayTag[] = ['read', 'write']

  return (
    <Card>
      <CardHeader>
        <CardTitle>Relays</CardTitle>
        <CardDescription>Manage the Nostr relays your client connects to.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            {config.relays.length === 0 ? (
              <p className="text-muted-foreground">
                No relays configured. Add some below or reset to defaults.
              </p>
            ) : (
              <ScrollArea className="w-full rounded-md border p-4">
                <ul className="space-y-2">
                  {config.relays.map(relay => (
                    <li key={relay.url} className="flex items-center justify-between text-sm">
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-2 mt-1">
                          <span>{relay.name || relay.url}</span>
                          {(relay.tags || []).map(tag => (
                            <Badge key={tag} variant={tag == 'write' ? 'default' : 'outline'}>
                              {' '}
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
                                checked={(relay.tags || []).includes(tag)}
                                onCheckedChange={() => handleToggleTag(relay.url, tag)}
                              >
                                {tag}
                              </DropdownMenuCheckboxItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveRelay(relay.url)}
                        >
                          <XIcon className="h-4 w-4" />
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
              placeholder="Add new relay URL (e.g., wss://relay.damus.io)"
              value={newRelayUrl}
              onChange={e => setNewRelayUrl(e.target.value)}
              onKeyPress={e => {
                if (e.key === 'Enter') {
                  handleAddRelay()
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
  )
}
