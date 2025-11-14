import { useState, useMemo, useEffect } from 'react'
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
import type { NostrEvent } from 'nostr-tools'

interface MirrorVideoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  videoUrls: string[]
  videoSize?: number // Size in bytes
  videoEvent?: NostrEvent | null
}

interface NormalizedServer {
  url: string
  name: string
  isCurrentHost: boolean
  source: 'user' | 'config'
}

/**
 * Format bytes to human-readable size (MB or GB)
 */
function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return 'size unknown'
  const mb = bytes / (1024 * 1024)
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`
  }
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
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

function parseNumericSize(value?: string | number | null): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = parseInt(trimmed, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return undefined
}

function getSizeFromVideoEvent(event?: NostrEvent | null): number | undefined {
  if (!event) return undefined
  const sizeTag = event.tags.find(tag => tag[0] === 'size')
  const directSize = sizeTag ? parseNumericSize(sizeTag[1]) : undefined
  if (directSize) return directSize

  const imetaTag = event.tags.find(tag => tag[0] === 'imeta')
  if (!imetaTag) return undefined

  for (let i = 1; i < imetaTag.length; i++) {
    const entry = imetaTag[i]
    const separatorIndex = entry.indexOf(' ')
    if (separatorIndex === -1) continue
    const key = entry.slice(0, separatorIndex)
    const value = entry.slice(separatorIndex + 1)
    if (key === 'size') {
      const parsed = parseNumericSize(value)
      if (parsed) return parsed
    }
  }

  return undefined
}

function decodeIfDifferent(value: string): string | undefined {
  try {
    const decoded = decodeURIComponent(value)
    return decoded !== value ? decoded : undefined
  } catch {
    return undefined
  }
}

function parseDescriptorSize(headerValue?: string | null): number | undefined {
  if (!headerValue) return undefined
  const attempts = new Set<string>()
  const trimmed = headerValue.trim()
  if (trimmed) {
    attempts.add(trimmed)
    const decoded = decodeIfDifferent(trimmed)
    if (decoded) attempts.add(decoded)
  }

  for (const candidate of attempts) {
    try {
      const parsedJson = JSON.parse(candidate)
      if (parsedJson && typeof parsedJson === 'object') {
        const possibleSizes = [
          (parsedJson as Record<string, unknown>).size,
          (parsedJson as Record<string, any>).blob?.size,
          (parsedJson as Record<string, any>).meta?.size,
        ]
        for (const maybeSize of possibleSizes) {
          const normalized = parseNumericSize(maybeSize)
          if (normalized) return normalized
        }
      }
    } catch {
      // Not JSON, fall through to numeric extraction
    }

    const numericDirect = parseNumericSize(candidate)
    if (numericDirect) return numericDirect

    const match = candidate.match(/(\d+)/)
    if (match) {
      const parsed = parseInt(match[1], 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed
      }
    }
  }

  return undefined
}

function buildBlossomHeadUrls(videoUrls: string[]): string[] {
  const urls: string[] = []
  const seen = new Set<string>()

  for (const url of videoUrls) {
    const { sha256, ext } = extractBlossomHash(url.split('?')[0])
    if (!sha256) continue

    try {
      const urlObj = new URL(url)
      const hostCandidates = new Set<string>()
      const originParam = urlObj.searchParams.get('origin')
      if (originParam) {
        try {
          const originUrl = new URL(originParam)
          hostCandidates.add(originUrl.origin)
        } catch {
          // ignore invalid origin parameter
        }
      }
      hostCandidates.add(urlObj.origin)

      for (const host of hostCandidates) {
        const normalizedHost = host.replace(/\/$/, '')
        const candidateUrl = `${normalizedHost}/${sha256}${ext ? `.${ext}` : ''}`
        if (!seen.has(candidateUrl)) {
          seen.add(candidateUrl)
          urls.push(candidateUrl)
        }
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return urls
}

async function fetchVideoSizeFromBlossom(videoUrls: string[]): Promise<number | undefined> {
  const targets = buildBlossomHeadUrls(videoUrls)
  if (targets.length === 0) return undefined

  for (const target of targets) {
    try {
      const response = await fetch(target, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        continue
      }

      const descriptorHeader =
        response.headers.get('Blossom-Descriptor') || response.headers.get('blossom-descriptor')
      const descriptorSize = parseDescriptorSize(descriptorHeader)
      if (descriptorSize) {
        return descriptorSize
      }

      const contentLengthSize = parseNumericSize(response.headers.get('content-length'))
      if (contentLengthSize) {
        return contentLengthSize
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug('[MirrorVideoDialog] Failed to resolve blob size via HEAD', error)
      }
    }
  }

  return undefined
}

export function MirrorVideoDialog({
  open,
  onOpenChange,
  videoUrls,
  videoSize,
  videoEvent,
}: MirrorVideoDialogProps) {
  const { toast } = useToast()
  const { config } = useAppContext()
  const { data: userBlossomServers } = useUserBlossomServers()
  const sizeFromEvent = useMemo(() => getSizeFromVideoEvent(videoEvent), [videoEvent])
  const [resolvedVideoSize, setResolvedVideoSize] = useState<number | undefined>(
    videoSize && videoSize > 0 ? videoSize : sizeFromEvent
  )
  const [selectedServers, setSelectedServers] = useState<Set<string>>(new Set())
  const [isMirroring, setIsMirroring] = useState(false)

  useEffect(() => {
    const preferredSize = videoSize && videoSize > 0 ? videoSize : sizeFromEvent
    setResolvedVideoSize(preferredSize)
  }, [videoSize, sizeFromEvent])

  useEffect(() => {
    if (!open) return
    if (resolvedVideoSize && resolvedVideoSize > 0) return

    let isCancelled = false

    fetchVideoSizeFromBlossom(videoUrls).then(size => {
      if (!isCancelled && size && size > 0) {
        setResolvedVideoSize(size)
      }
    })

    return () => {
      isCancelled = true
    }
  }, [open, videoUrls, resolvedVideoSize])

  // Extract current hosting servers from video URLs
  const currentHosts = useMemo(() => {
    if (!open) return new Set<string>()
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
  }, [videoUrls, open])

  // Combine and deduplicate servers from user's 10063 list and app config
  const availableServers = useMemo(() => {
    if (!open) return []
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
    const sorted = Array.from(serverMap.values()).sort((a, b) => {
      if (a.isCurrentHost && !b.isCurrentHost) return -1
      if (!a.isCurrentHost && b.isCurrentHost) return 1
      return a.name.localeCompare(b.name)
    })
    return sorted
  }, [userBlossomServers, config.blossomServers, currentHosts, open])

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
          <DialogTitle>Mirror Video ({formatFileSize(resolvedVideoSize)})</DialogTitle>
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
