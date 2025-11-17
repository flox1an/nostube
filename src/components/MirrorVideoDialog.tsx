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
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { extractBlossomHash } from '@/utils/video-event'
import { formatFileSize, getSizeFromVideoEvent, fetchVideoSizeFromBlossom } from '@/lib/blossom-utils'
import { mirrorBlobsToServers } from '@/lib/blossom-upload'
import type { NostrEvent } from 'nostr-tools'
import type { BlobDescriptor } from 'blossom-client-sdk'
import type { ServerInfo, ServerAvailability } from '@/hooks/useVideoServerAvailability'

interface MirrorVideoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  videoUrls: string[]
  videoSize?: number // Size in bytes
  videoEvent?: NostrEvent | null
  serverList: ServerInfo[]
  serverAvailability: Map<string, ServerAvailability>
  isCheckingAvailability: boolean
}

export function MirrorVideoDialog({
  open,
  onOpenChange,
  videoUrls,
  videoSize,
  videoEvent,
  serverList,
  serverAvailability,
  isCheckingAvailability: _isCheckingAvailability,
}: MirrorVideoDialogProps) {
  const { toast } = useToast()
  const { user } = useCurrentUser()
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

  // Get servers that currently host the video (from video URLs)
  const currentHosts = useMemo(() => {
    return serverList.filter(s => s.source === 'video-url')
  }, [serverList])

  // Get available servers to mirror to (exclude current hosts)
  const availableServers = useMemo(() => {
    return serverList.filter(s => s.source !== 'video-url')
  }, [serverList])

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

    // Check if user is logged in
    if (!user?.signer) {
      toast({
        title: 'Not logged in',
        description: 'Please log in to mirror videos.',
        variant: 'destructive',
      })
      return
    }

    // Find working blossom URL from videoUrls
    const workingUrl = videoUrls.find(url => {
      const { sha256 } = extractBlossomHash(url)
      return sha256 // Has valid hash = valid blossom URL
    })

    if (!workingUrl) {
      toast({
        title: 'Invalid video',
        description: 'No valid blossom URL found.',
        variant: 'destructive',
      })
      return
    }

    // Extract blob info
    const { sha256, ext } = extractBlossomHash(workingUrl)
    if (!sha256) {
      toast({
        title: 'Invalid video',
        description: 'Could not extract video hash.',
        variant: 'destructive',
      })
      return
    }

    // Determine MIME type from extension
    const mimeTypes: Record<string, string> = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      avi: 'video/x-msvideo',
    }
    const mimeType = ext ? mimeTypes[ext] || 'video/mp4' : 'video/mp4'

    const blobDescriptor: BlobDescriptor = {
      sha256,
      size: resolvedVideoSize || 0,
      type: mimeType,
      url: workingUrl,
      uploaded: Date.now(),
    }

    setIsMirroring(true)
    try {
      const results = await mirrorBlobsToServers({
        mirrorServers: Array.from(selectedServers),
        blob: blobDescriptor,
        signer: async draft => await user.signer.signEvent(draft),
      })

      const successCount = results.length
      const totalCount = selectedServers.size
      const failedCount = totalCount - successCount

      if (successCount === 0) {
        // All failed
        toast({
          title: 'Mirror failed',
          description: 'Could not mirror to any servers. Please try again.',
          variant: 'destructive',
        })
      } else if (failedCount > 0) {
        // Partial success - show warning
        toast({
          title: 'Partially mirrored',
          description: `Mirrored to ${successCount} of ${totalCount} servers. ${failedCount} failed.`,
        })
        onOpenChange(false)
      } else {
        // All succeeded
        toast({
          title: 'Mirror complete',
          description: `Successfully mirrored to ${successCount} server${successCount !== 1 ? 's' : ''}.`,
        })
        onOpenChange(false)
      }
    } catch (error) {
      toast({
        title: 'Mirror error',
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
          {currentHosts.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-3">Currently Hosted On</h3>
              <div className="space-y-2">
                {currentHosts.map(server => (
                  <div
                    key={server.url}
                    className="flex items-center gap-3 p-3 rounded-md bg-muted/50 border"
                  >
                    <Server className="h-4 w-4 text-green-500" />
                    <span className="text-sm flex-1">{server.name}</span>
                    <Check className="h-4 w-4 text-green-500" />
                  </div>
                ))}
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
                {availableServers.map(server => {
                  const availability = serverAvailability.get(server.url)
                  const isAvailable = availability?.status === 'available'
                  const isChecking = availability?.status === 'checking'

                  return (
                    <div
                      key={server.url}
                      className="flex items-center gap-3 p-3 rounded-md border hover:bg-muted/50"
                    >
                      <Checkbox
                        id={server.url}
                        checked={selectedServers.has(server.url)}
                        onCheckedChange={() => handleToggleServer(server.url)}
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
                        {isChecking && (
                          <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />
                        )}
                        {isAvailable && (
                          <span className="text-xs text-green-600 dark:text-green-400">
                            Available
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground capitalize">
                          ({server.source})
                        </span>
                      </Label>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isMirroring}>
            Cancel
          </Button>
          <Button
            onClick={handleMirror}
            disabled={selectedServers.size === 0 || isMirroring || !user}
          >
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
