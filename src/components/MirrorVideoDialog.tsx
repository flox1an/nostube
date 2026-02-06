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
import { Loader2, Copy, Server, Video, Image, Captions, Check, X, Circle } from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { formatFileSize } from '@/lib/blossom-utils'
import { mirrorBlobsToServers } from '@/lib/blossom-upload'
import {
  publishMirrorAnnouncements,
  getMirrorAnnouncementRelays,
  type MirrorAnnouncementOptions,
} from '@/lib/mirror-announcements'
import { useAppContext } from '@/hooks/useAppContext'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { useMultiVideoServerAvailability } from '@/hooks/useMultiVideoServerAvailability'
import {
  extractAllBlossomBlobs,
  deduplicateVariants,
  getTotalBlobSize,
} from '@/lib/blossom-blob-extractor'
import type { BlobDescriptor } from 'blossom-client-sdk'
import type { BlossomServer } from '@/contexts/AppContext'
import type { VideoEvent } from '@/utils/video-event'
import { useTranslation } from 'react-i18next'

interface MirrorVideoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  video: VideoEvent | null
  blossomServers?: BlossomServer[]
  userServers?: string[]
  onMirrorComplete?: () => void
}

// Helper to get icon for blob type
function getBlobIcon(mimeType?: string) {
  if (mimeType?.startsWith('video/')) return Video
  if (mimeType?.startsWith('text/')) return Captions
  return Image
}

// Helper function to render status icon
function renderStatusIcon(status: string) {
  switch (status) {
    case 'checking':
      return <Loader2 className="w-3 h-3 text-blue-500 animate-spin shrink-0" />
    case 'available':
      return <Check className="w-3 h-3 text-green-500 shrink-0" />
    case 'unavailable':
      return <X className="w-3 h-3 text-red-500 shrink-0" />
    case 'error':
      return <X className="w-3 h-3 text-orange-500 shrink-0" />
    default:
      return <Circle className="w-3 h-3 text-muted-foreground shrink-0" />
  }
}

export function MirrorVideoDialog({
  open,
  onOpenChange,
  video,
  blossomServers,
  userServers,
  onMirrorComplete,
}: MirrorVideoDialogProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { user } = useCurrentUser()
  const { config } = useAppContext()

  // Extract all blobs from the video event
  const allBlobs = useMemo(() => extractAllBlossomBlobs(video), [video])
  const totalSize = useMemo(() => getTotalBlobSize(allBlobs), [allBlobs])

  // Deduplicate thumbnails for the hook
  const deduplicatedThumbnails = useMemo(
    () => deduplicateVariants(video?.thumbnailVariants || []),
    [video?.thumbnailVariants]
  )

  // Use multi-variant availability hook
  const { allVariants, checkAllAvailability, isAnyChecking } = useMultiVideoServerAvailability({
    videoVariants: video?.allVideoVariants || video?.videoVariants || [],
    thumbnailVariants: deduplicatedThumbnails,
    textTracks: video?.textTracks || [],
    configServers: blossomServers,
    userServers,
  })

  // Track selected blobs and target servers
  const [selectedBlobs, setSelectedBlobs] = useState<Set<number>>(new Set())
  const [selectedServers, setSelectedServers] = useState<Set<string>>(new Set())
  const [isMirroring, setIsMirroring] = useState(false)

  // Check availability when dialog opens
  useMemo(() => {
    if (open && allVariants.length > 0) {
      checkAllAvailability()
    }
    // Reset selections when dialog opens/closes
    if (open) {
      // Pre-select all blobs by default
      setSelectedBlobs(new Set(allBlobs.map((_, i) => i)))
      setSelectedServers(new Set())
    }
  }, [open, allVariants.length, allBlobs, checkAllAvailability])

  // Get unique servers from all variants that aren't already hosting (source !== 'video-url')
  const availableServers = useMemo(() => {
    const serverMap = new Map<string, { url: string; name: string; source: string }>()

    for (const variant of allVariants) {
      for (const server of variant.serverList) {
        // Only include servers that aren't already hosting (user or config servers)
        if (server.source !== 'video-url' && !serverMap.has(server.url)) {
          serverMap.set(server.url, server)
        }
      }
    }

    return Array.from(serverMap.values())
  }, [allVariants])

  // Calculate how many blobs each server already has
  const serverBlobCounts = useMemo(() => {
    const counts = new Map<string, { available: number; total: number }>()

    for (const server of availableServers) {
      let available = 0
      for (const variant of allVariants) {
        const serverStatus = variant.serverAvailability.get(server.url)
        if (serverStatus?.status === 'available') {
          available++
        }
      }
      counts.set(server.url, { available, total: allVariants.length })
    }

    return counts
  }, [availableServers, allVariants])

  const handleToggleBlob = (index: number) => {
    setSelectedBlobs(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

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
    if (selectedBlobs.size === 0) {
      toast({
        title: t('video.mirror.noSelection'),
        description: t('video.mirror.selectBlobs'),
        variant: 'destructive',
      })
      return
    }

    if (selectedServers.size === 0) {
      toast({
        title: t('video.mirror.noSelection'),
        description: t('video.mirror.noSelectionMessage'),
        variant: 'destructive',
      })
      return
    }

    if (!user?.signer) {
      toast({
        title: t('video.mirror.notLoggedIn'),
        description: t('video.mirror.notLoggedInMessage'),
        variant: 'destructive',
      })
      return
    }

    setIsMirroring(true)
    let totalSuccess = 0
    let totalFailed = 0

    // Track mirror results per blob for 1063 publishing
    const mirrorResultsPerBlob: Array<{
      blob: (typeof allBlobs)[number]
      results: BlobDescriptor[]
    }> = []

    try {
      // Mirror each selected blob to each selected server
      for (const blobIndex of selectedBlobs) {
        const blob = allBlobs[blobIndex]
        if (!blob || !blob.hash) continue

        // Determine MIME type
        const mimeTypes: Record<string, string> = {
          mp4: 'video/mp4',
          webm: 'video/webm',
          mov: 'video/quicktime',
          avi: 'video/x-msvideo',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          webp: 'image/webp',
          vtt: 'text/vtt',
          srt: 'text/srt',
        }
        const mimeType =
          blob.variant.mimeType || mimeTypes[blob.ext || ''] || 'application/octet-stream'

        const blobDescriptor: BlobDescriptor = {
          sha256: blob.hash,
          size: blob.variant.size || 0,
          type: mimeType,
          url: blob.variant.url,
          uploaded: Date.now(),
        }

        try {
          const results = await mirrorBlobsToServers({
            mirrorServers: Array.from(selectedServers),
            blob: blobDescriptor,
            signer: async draft => await user.signer.signEvent(draft),
          })

          totalSuccess += results.length
          totalFailed += selectedServers.size - results.length

          // Track results for 1063 publishing
          if (results.length > 0) {
            mirrorResultsPerBlob.push({ blob, results })
          }
        } catch {
          totalFailed += selectedServers.size
        }
      }

      const totalAttempted = selectedBlobs.size * selectedServers.size

      // Publish kind 1063 events for successful mirrors
      if (mirrorResultsPerBlob.length > 0 && video) {
        try {
          // Get relay hint from video event's seen relays or user's relays
          const videoEventRelays = video.id
            ? Array.from(getSeenRelays({ id: video.id } as never) || [])
            : []
          const userWriteRelays = config.relays
            .filter(r => r.tags.includes('write'))
            .map(r => r.url)

          const publishRelays = getMirrorAnnouncementRelays(userWriteRelays, videoEventRelays)
          const relayHint = publishRelays[0] || ''

          // Build announcement options
          const announcements: MirrorAnnouncementOptions[] = mirrorResultsPerBlob.map(
            ({ blob, results }) => ({
              blob,
              mirrorResults: results,
              videoEvent: {
                id: video.id,
                kind: video.kind,
                pubkey: video.pubkey,
                dTag: video.identifier,
              },
              relayHint,
            })
          )

          // Publish 1063 events (non-blocking, errors are logged but don't fail the mirror)
          await publishMirrorAnnouncements(
            announcements,
            { signEvent: async event => await user.signer.signEvent(event) },
            publishRelays
          )
        } catch (err) {
          // Log but don't fail - the mirror itself succeeded
          console.warn('[MirrorVideoDialog] Failed to publish 1063 announcements:', err)
        }
      }

      if (totalSuccess === 0) {
        toast({
          title: t('video.mirror.failed'),
          description: t('video.mirror.failedMessage'),
          variant: 'destructive',
        })
      } else if (totalFailed > 0) {
        toast({
          title: t('video.mirror.partial'),
          description: t('video.mirror.partialMessage', {
            success: totalSuccess,
            total: totalAttempted,
            failed: totalFailed,
          }),
        })
        onMirrorComplete?.()
        onOpenChange(false)
      } else {
        toast({
          title: t('video.mirror.complete'),
          description: t('video.mirror.completeMessage', { count: totalSuccess }),
        })
        onMirrorComplete?.()
        onOpenChange(false)
      }
    } catch (error) {
      toast({
        title: t('video.mirror.errorTitle'),
        description: error instanceof Error ? error.message : t('video.mirror.errorMessage'),
        variant: 'destructive',
      })
    } finally {
      setIsMirroring(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {t('video.mirror.title')} ({allBlobs.length} {allBlobs.length === 1 ? 'file' : 'files'})
          </DialogTitle>
          <DialogDescription>
            {t('video.mirror.description')}
            {totalSize > 0 && ` • ${formatFileSize(totalSize)} total`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* Blobs to mirror */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">{t('video.mirror.filesTo')}</h3>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedBlobs(new Set(allBlobs.map((_, i) => i)))}
                  disabled={selectedBlobs.size === allBlobs.length}
                >
                  {t('common.selectAll')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedBlobs(new Set())}
                  disabled={selectedBlobs.size === 0}
                >
                  {t('common.selectNone')}
                </Button>
              </div>
            </div>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {allBlobs.map((blob, index) => {
                const Icon = getBlobIcon(blob.variant.mimeType)
                return (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-2 rounded-md border hover:bg-muted/50"
                  >
                    <Checkbox
                      id={`blob-${index}`}
                      checked={selectedBlobs.has(index)}
                      onCheckedChange={() => handleToggleBlob(index)}
                    />
                    <Label
                      htmlFor={`blob-${index}`}
                      className="flex-1 cursor-pointer flex items-center gap-2"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{blob.label}</div>
                        {blob.variant.size && (
                          <div className="text-xs text-muted-foreground">
                            {formatFileSize(blob.variant.size)}
                          </div>
                        )}
                      </div>
                    </Label>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Target servers */}
          <div>
            <h3 className="text-sm font-medium mb-3">
              {t('video.mirror.availableServers')} ({availableServers.length})
            </h3>
            {availableServers.length === 0 ? (
              <div className="text-sm text-muted-foreground p-4 border border-dashed rounded-md text-center">
                {t('video.mirror.noServers')}
              </div>
            ) : (
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {availableServers.map(server => {
                  const counts = serverBlobCounts.get(server.url)
                  const hasAllBlobs = counts && counts.available === counts.total

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
                        <Server className="h-4 w-4 shrink-0" />
                        <div className="flex-1">
                          <div className="text-sm font-medium">{server.name}</div>
                          <div className="text-xs text-muted-foreground">{server.url}</div>
                        </div>
                        {/* Show blob availability count */}
                        {counts && (
                          <div className="flex items-center gap-1 text-xs">
                            {isAnyChecking ? (
                              <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                            ) : hasAllBlobs ? (
                              <>
                                <Check className="w-3 h-3 text-green-500" />
                                <span className="text-green-600">All files</span>
                              </>
                            ) : counts.available > 0 ? (
                              <>
                                {renderStatusIcon('available')}
                                <span className="text-muted-foreground">
                                  {counts.available}/{counts.total}
                                </span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">0/{counts.total}</span>
                            )}
                          </div>
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
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleMirror}
            disabled={
              selectedBlobs.size === 0 || selectedServers.size === 0 || isMirroring || !user
            }
          >
            {isMirroring ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('video.mirror.mirroring')}
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                {t('video.mirror.mirrorButton', {
                  count: selectedServers.size,
                })}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
