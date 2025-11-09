import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Loader2, Copy, Check, Server } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { useUserBlossomServers } from '@/hooks/useUserBlossomServers'
import { useAppContext } from '@/hooks/useAppContext'
import { extractBlossomHash } from '@/utils/video-event'
import type { BlossomServer } from '@/contexts/AppContext'

interface MirrorVideoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  videoUrls: string[]
}

interface NormalizedServer {
  url: string
  name: string
  isCurrentHost: boolean
  source: 'user' | 'config'
}

/**
 * Normalize a server URL to a consistent format (remove trailing slash, lowercase hostname)
 */
function normalizeServerUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    // Normalize: protocol + lowercase hostname (no trailing slash, no path)
    return `${urlObj.protocol}//${urlObj.hostname.toLowerCase()}`
  } catch {
    return url.replace(/\/$/, '').toLowerCase()
  }
}

export function MirrorVideoDialog({ open, onOpenChange, videoUrls }: MirrorVideoDialogProps) {
  const { toast } = useToast()
  const { config } = useAppContext()
  const { data: userBlossomServers } = useUserBlossomServers()
  const [selectedServers, setSelectedServers] = useState<Set<string>>(new Set())
  const [isMirroring, setIsMirroring] = useState(false)

  // Extract current hosting servers from video URLs
  const currentHosts = useMemo(() => {
    const hosts = new Set<string>()
    for (const url of videoUrls) {
      // Skip proxy URLs (they have ?origin= query parameter)
      if (url.includes('?origin=')) continue

      try {
        const urlObj = new URL(url)
        const { sha256 } = extractBlossomHash(url)
        // Only count if it's a valid blossom URL (has SHA256 hash)
        if (sha256) {
          hosts.add(normalizeServerUrl(urlObj.origin))
        }
      } catch {
        // Invalid URL, skip
      }
    }
    return hosts
  }, [videoUrls])

  // Combine and deduplicate servers from user's 10063 list and app config
  const availableServers = useMemo(() => {
    const serverMap = new Map<string, NormalizedServer>()

    // Add user's blossom servers from kind 10063
    if (userBlossomServers && userBlossomServers.length > 0) {
      for (const serverUrl of userBlossomServers) {
        const normalized = normalizeServerUrl(serverUrl)
        if (!serverMap.has(normalized)) {
          serverMap.set(normalized, {
            url: normalized,
            name: new URL(normalized).hostname,
            isCurrentHost: currentHosts.has(normalized),
            source: 'user',
          })
        }
      }
    }

    // Add servers from app config
    if (config.blossomServers && config.blossomServers.length > 0) {
      for (const server of config.blossomServers) {
        const normalized = normalizeServerUrl(server.url)
        if (!serverMap.has(normalized)) {
          serverMap.set(normalized, {
            url: normalized,
            name: server.name || new URL(normalized).hostname,
            isCurrentHost: currentHosts.has(normalized),
            source: 'config',
          })
        }
      }
    }

    // Sort: current hosts first, then alphabetically by name
    return Array.from(serverMap.values()).sort((a, b) => {
      if (a.isCurrentHost && !b.isCurrentHost) return -1
      if (!a.isCurrentHost && b.isCurrentHost) return 1
      return a.name.localeCompare(b.name)
    })
  }, [userBlossomServers, config.blossomServers, currentHosts])

  const handleToggleServer = (serverUrl: string) => {
    setSelectedServers(prev => {
      const next = new Set(prev)
      if (next.has(serverUrl)) {
        next.delete(serverUrl)
      } else {
        next.add(serverUrl)
      }
      return next
    })
  }

  const handleMirror = async () => {
    if (selectedServers.size === 0) {
      toast({
        title: 'No servers selected',
        description: 'Please select at least one server to mirror to.',
        variant: 'destructive',
      })
      return
    }

    setIsMirroring(true)
    try {
      // TODO: Implement actual mirroring logic
      await new Promise(resolve => setTimeout(resolve, 2000))

      toast({
        title: 'Mirror not implemented',
        description: 'This feature will copy the video to your selected blossom servers.',
      })

      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to mirror video.',
        variant: 'destructive',
      })
    } finally {
      setIsMirroring(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Mirror Video</DialogTitle>
          <DialogDescription>
            Copy this video to additional blossom servers for better redundancy and availability.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* Current hosting servers */}
          {currentHosts.size > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3">Currently Hosted On</h3>
              <div className="space-y-2">
                {Array.from(currentHosts).map(host => {
                  try {
                    const hostname = new URL(host).hostname
                    return (
                      <div
                        key={host}
                        className="flex items-center gap-3 p-3 rounded-md bg-muted/50 border"
                      >
                        <Server className="h-4 w-4 text-green-500" />
                        <span className="text-sm flex-1">{hostname}</span>
                        <Check className="h-4 w-4 text-green-500" />
                      </div>
                    )
                  } catch {
                    return null
                  }
                })}
              </div>
            </div>
          )}

          {/* Available servers to mirror to */}
          <div>
            <h3 className="text-sm font-medium mb-3">
              Available Servers ({availableServers.length})
            </h3>
            {availableServers.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4 border border-dashed rounded-md text-center">
                No blossom servers configured. Add servers in your settings or publish a kind 10063
                event with your preferred servers.
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {availableServers.map(server => (
                  <div
                    key={server.url}
                    className={`flex items-center gap-3 p-3 rounded-md border ${
                      server.isCurrentHost
                        ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <Checkbox
                      id={server.url}
                      checked={selectedServers.has(server.url)}
                      onCheckedChange={() => handleToggleServer(server.url)}
                      disabled={server.isCurrentHost}
                    />
                    <Label
                      htmlFor={server.url}
                      className="flex-1 cursor-pointer flex items-center gap-2"
                    >
                      <Server className="h-4 w-4" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{server.name}</div>
                        <div className="text-xs text-muted-foreground">{server.url}</div>
                      </div>
                      {server.isCurrentHost && (
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                          Already hosted
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground capitalize">
                        ({server.source})
                      </span>
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMirroring}>
            Cancel
          </Button>
          <Button onClick={handleMirror} disabled={selectedServers.size === 0 || isMirroring}>
            {isMirroring ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Mirroring...
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Mirror to {selectedServers.size} server{selectedServers.size !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
