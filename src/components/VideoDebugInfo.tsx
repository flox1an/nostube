import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { extractBlossomHash } from '@/utils/video-event'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { Check, Circle, Loader2, X, Video, Image, Captions, ChevronRight } from 'lucide-react'
import type { NostrEvent } from 'nostr-tools'
import type { BlossomServer } from '@/contexts/AppContext'
import type { VideoEvent, VideoVariant } from '@/utils/video-event'
import { useEffect, useRef, useMemo } from 'react'
import type { ServerAvailability } from '@/hooks/useVideoServerAvailability'
import { useMultiVideoServerAvailability } from '@/hooks/useMultiVideoServerAvailability'
import { deduplicateVariants } from '@/lib/blossom-blob-extractor'

interface VideoDebugInfoProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  videoEvent: NostrEvent | null | undefined
  video: VideoEvent | null
  blossomServers?: BlossomServer[]
  userServers?: string[]
}

// Helper function to render status icon
function renderStatusIcon(status: string) {
  switch (status) {
    case 'checking':
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
    case 'available':
      return <Check className="w-4 h-4 text-green-500 shrink-0" />
    case 'unavailable':
      return <X className="w-4 h-4 text-red-500 shrink-0" />
    case 'error':
      return <X className="w-4 h-4 text-orange-500 shrink-0" />
    default:
      return <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
  }
}

// Helper function to get status color
function getStatusColor(status: string) {
  switch (status) {
    case 'checking':
      return 'text-blue-500'
    case 'available':
      return 'text-green-500'
    case 'unavailable':
      return 'text-red-500'
    case 'error':
      return 'text-orange-500'
    default:
      return 'text-muted-foreground'
  }
}

// Helper function to get status text
function getStatusText(availability: ServerAvailability | undefined) {
  if (!availability) return 'Not checked'

  switch (availability.status) {
    case 'checking':
      return 'Checking...'
    case 'available':
      return availability.contentLength
        ? `Available (${(availability.contentLength / 1024 / 1024).toFixed(2)} MB)`
        : 'Available'
    case 'unavailable':
      return `Not found (${availability.statusCode})`
    case 'error':
      return 'Connection error'
    default:
      return 'Unknown'
  }
}

export function VideoDebugInfo({
  open,
  onOpenChange,
  videoEvent,
  video,
  blossomServers,
  userServers,
}: VideoDebugInfoProps) {
  // Deduplicate thumbnails with same URL or hash
  const deduplicatedThumbnails = useMemo(
    () => deduplicateVariants(video?.thumbnailVariants || []),
    [video?.thumbnailVariants]
  )

  // Debug: Log what variants we have
  if (import.meta.env.DEV && open) {
    console.debug('[VideoDebugInfo] Input data:', {
      allVideoVariants: video?.allVideoVariants?.length || 0,
      thumbnailVariants: video?.thumbnailVariants?.length || 0,
      deduplicatedThumbnails: deduplicatedThumbnails.length,
      textTracks: video?.textTracks?.length || 0,
      thumbnails: video?.thumbnailVariants,
      tracks: video?.textTracks,
    })
  }

  // Use multi-variant availability hook
  // Use allVideoVariants to show ALL variants including incompatible codecs for debugging
  const { allVariants, checkAllAvailability } = useMultiVideoServerAvailability({
    videoVariants: video?.allVideoVariants || [],
    thumbnailVariants: deduplicatedThumbnails,
    textTracks: video?.textTracks || [],
    configServers: blossomServers,
    userServers,
  })

  // Debug: Log what the hook returns
  if (import.meta.env.DEV && open) {
    console.debug('[VideoDebugInfo] Hook output:', {
      allVariantsCount: allVariants.length,
      allVariants: allVariants.map(v => ({ label: v.label, mimeType: v.variant.mimeType })),
    })
  }

  // Store checkAllAvailability in ref to avoid triggering effect on every state update
  const checkAllAvailabilityRef = useRef(checkAllAvailability)
  useEffect(() => {
    checkAllAvailabilityRef.current = checkAllAvailability
  }, [checkAllAvailability])

  // Trigger availability check when dialog opens (only on open transition)
  const prevOpenRef = useRef(open)
  useEffect(() => {
    // Only trigger when dialog opens (transitions from false to true)
    if (open && !prevOpenRef.current && allVariants.length > 0) {
      checkAllAvailabilityRef.current()
    }
    prevOpenRef.current = open
  }, [open, allVariants.length])

  // Helper function to render server availability for a variant
  const renderVariantServers = (
    variant: VideoVariant,
    serverAvailability: Map<string, ServerAvailability>
  ) => {
    const { sha256 } = extractBlossomHash(variant.url)
    const variantUrls = [variant.url, ...variant.fallbackUrls]

    return (
      <div className="space-y-4">
        {/* Variant Information */}
        <div className="bg-muted/50 p-3 rounded-lg">
          <div className="text-sm space-y-1">
            <div>
              <span className="font-medium">URL: </span>
              <code className="text-xs break-all">{variant.url}</code>
            </div>
            {sha256 && (
              <div>
                <span className="font-medium">SHA256: </span>
                <code className="text-xs">{sha256}</code>
              </div>
            )}
            {variant.quality && (
              <div>
                <span className="font-medium">Quality: </span>
                <span className="text-xs">{variant.quality}</span>
              </div>
            )}
            {variant.dimensions && (
              <div>
                <span className="font-medium">Dimensions: </span>
                <span className="text-xs">{variant.dimensions}</span>
              </div>
            )}
            {variant.size && (
              <div>
                <span className="font-medium">Size: </span>
                <span className="text-xs">{(variant.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            )}
            {variant.mimeType && (
              <div>
                <span className="font-medium">MIME Type: </span>
                <span className="text-xs font-mono">{variant.mimeType}</span>
              </div>
            )}
            {variant.hash && (
              <div>
                <span className="font-medium">Hash (x tag): </span>
                <code className="text-xs">{variant.hash}</code>
              </div>
            )}
          </div>
        </div>

        {/* Server Availability */}
        <div>
          <h4 className="text-sm font-medium mb-2">
            Server Availability ({Array.from(serverAvailability.values()).length})
          </h4>
          {serverAvailability.size > 0 ? (
            <ul className="space-y-2 text-sm">
              {Array.from(serverAvailability.values()).map((server, idx) => {
                const statusIcon = renderStatusIcon(server.status)
                const statusColor = getStatusColor(server.status)
                const statusText = getStatusText(server)

                return (
                  <li key={idx} className="flex items-start gap-2">
                    {statusIcon}
                    <div className="flex-1">
                      <code className="text-xs block">{server.url}</code>
                      <div className="text-xs text-muted-foreground">{server.name}</div>
                      <div className={`text-xs ${statusColor} font-medium`}>{statusText}</div>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No servers found</p>
          )}
        </div>

        {/* Fallback URLs */}
        {variantUrls.length > 1 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Fallback URLs ({variantUrls.length - 1})</h4>
            <ul className="space-y-1 text-sm">
              {variantUrls.slice(1).map((url, idx) => (
                <li key={idx} className="break-all">
                  <code className="text-xs text-muted-foreground">{url}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Debug Info</DialogTitle>
          <DialogDescription>
            Technical details about this video event, relays, and blossom servers
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[70vh] pr-4">
          <div className="space-y-6">
            {/* Full Event JSON - Collapsed by default */}
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 font-semibold mb-2 hover:text-foreground/80 group">
                <ChevronRight className="w-4 h-4 transition-transform group-data-[state=open]:rotate-90" />
                Nostr Event
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                  {JSON.stringify(videoEvent, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>

            {/* Relays */}
            <div>
              <h3 className="font-semibold mb-2">
                Relays ({videoEvent ? Array.from(getSeenRelays(videoEvent) || []).length : 0})
              </h3>
              <div className="bg-muted p-4 rounded-lg">
                {videoEvent && getSeenRelays(videoEvent) && getSeenRelays(videoEvent)!.size > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {Array.from(getSeenRelays(videoEvent)!).map((relay, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-500" />
                        <code className="text-xs">{relay}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No relay information available</p>
                )}
              </div>
            </div>

            {/* Blossom Servers - Responsive layout: stacked on mobile, side-by-side on desktop */}
            {allVariants.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Blossom Server Availability by Variant</h3>
                <Tabs defaultValue="0" className="w-full" orientation="vertical">
                  <div className="flex flex-col md:flex-row gap-4">
                    {/* Variant list: horizontal scroll on mobile, vertical list on desktop */}
                    <TabsList className="flex md:flex-col h-auto md:w-48 shrink-0 justify-start items-stretch overflow-x-auto md:overflow-x-visible">
                      {allVariants.map((variantData, idx) => {
                        const mimeType = variantData.variant.mimeType || ''
                        let Icon = Image
                        if (mimeType.startsWith('video/')) {
                          Icon = Video
                        } else if (mimeType.startsWith('text/')) {
                          Icon = Captions
                        }

                        return (
                          <TabsTrigger
                            key={idx}
                            value={idx.toString()}
                            className="justify-start gap-2 whitespace-nowrap md:whitespace-normal"
                          >
                            <Icon className="w-4 h-4 shrink-0" />
                            <span className="truncate">{variantData.label}</span>
                          </TabsTrigger>
                        )
                      })}
                    </TabsList>

                    {/* Variant details */}
                    <div className="flex-1 min-w-0">
                      {allVariants.map((variantData, idx) => (
                        <TabsContent key={idx} value={idx.toString()} className="mt-0">
                          <div className="bg-muted p-4 rounded-lg">
                            {renderVariantServers(
                              variantData.variant,
                              variantData.serverAvailability
                            )}
                          </div>
                        </TabsContent>
                      ))}
                    </div>
                  </div>
                </Tabs>
              </div>
            )}

            {/* Show message if no variants */}
            {allVariants.length === 0 && (
              <div>
                <h3 className="font-semibold mb-2">Blossom Servers</h3>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    No video variants or thumbnails found
                  </p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
