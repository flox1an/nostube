import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { extractBlossomHash } from '@/utils/video-event'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { Check, Circle, Loader2, X } from 'lucide-react'
import type { NostrEvent } from 'nostr-tools'
import type { BlossomServer } from '@/contexts/AppContext'
import type { VideoEvent } from '@/utils/video-event'
import { useState, useEffect } from 'react'

interface VideoDebugInfoProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  videoEvent: NostrEvent | null | undefined
  video: VideoEvent | null
  blossomServers?: BlossomServer[]
}

type ServerStatus = 'checking' | 'available' | 'unavailable' | 'error'

interface ServerAvailability {
  url: string
  status: ServerStatus
  statusCode?: number
  contentLength?: number
}

/**
 * Check if a file exists on a blossom server using HEAD request
 */
async function checkBlossomServer(
  serverUrl: string,
  sha256: string,
  ext: string
): Promise<ServerAvailability> {
  const normalizedUrl = serverUrl.replace(/\/$/, '')
  const fileUrl = `${normalizedUrl}/${sha256}.${ext}`

  try {
    const response = await fetch(fileUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    })

    const contentLength = response.headers.get('content-length')

    return {
      url: serverUrl,
      status: response.ok ? 'available' : 'unavailable',
      statusCode: response.status,
      contentLength: contentLength ? parseInt(contentLength) : undefined,
    }
  } catch (error) {
    return {
      url: serverUrl,
      status: 'error',
    }
  }
}

export function VideoDebugInfo({
  open,
  onOpenChange,
  videoEvent,
  video,
  blossomServers,
}: VideoDebugInfoProps) {
  const [serverAvailability, setServerAvailability] = useState<Map<string, ServerAvailability>>(
    new Map()
  )

  // Extract SHA256 and extension from first video URL
  const videoHash = video?.urls[0]
    ? extractBlossomHash(video.urls[0])
    : { sha256: undefined, ext: undefined }

  // Check all blossom servers when dialog opens
  useEffect(() => {
    if (!open || !videoHash.sha256 || !videoHash.ext) {
      return
    }

    const serversToCheck: string[] = []

    // Add configured blossom servers
    if (blossomServers && blossomServers.length > 0) {
      blossomServers.forEach(server => {
        serversToCheck.push(server.url)
      })
    }

    // Add origins from original URLs
    if (video?.urls) {
      video.urls.forEach(url => {
        // Skip proxy URLs
        if (url.includes('?origin=') || url.includes('?xs=')) return

        try {
          const urlObj = new URL(url)
          const origin = urlObj.origin
          if (!serversToCheck.includes(origin)) {
            serversToCheck.push(origin)
          }
        } catch {
          // Invalid URL, skip
        }
      })
    }

    if (serversToCheck.length === 0) {
      return
    }

    // Reset all to checking state
    const initialMap = new Map<string, ServerAvailability>()
    serversToCheck.forEach(serverUrl => {
      initialMap.set(serverUrl, { url: serverUrl, status: 'checking' })
    })
    setServerAvailability(initialMap)

    // Check each server
    serversToCheck.forEach(async serverUrl => {
      const result = await checkBlossomServer(serverUrl, videoHash.sha256!, videoHash.ext!)
      setServerAvailability(prev => new Map(prev).set(serverUrl, result))
    })
  }, [open, videoHash.sha256, videoHash.ext, blossomServers, video?.urls])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Debug Info</DialogTitle>
          <DialogDescription>
            Technical details about this video event, relays, and blossom servers
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[70vh] pr-4">
          <div className="space-y-6">
            {/* Full Event JSON */}
            <div>
              <h3 className="font-semibold mb-2">Nostr Event</h3>
              <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                {JSON.stringify(videoEvent, null, 2)}
              </pre>
            </div>

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

            {/* Blossom Servers */}
            <div>
              <h3 className="font-semibold mb-2">Blossom Servers</h3>
              <div className="bg-muted p-4 rounded-lg space-y-4">
                {/* Original URLs */}
                <div>
                  <h4 className="text-sm font-medium mb-2">
                    Original URLs ({video?.urls.length || 0})
                  </h4>
                  {video && video.urls.length > 0 ? (
                    <ul className="space-y-2 text-sm">
                      {video.urls.map((url, idx) => {
                        const { sha256 } = extractBlossomHash(url)
                        const isBlossomUrl = Boolean(sha256)
                        try {
                          const urlObj = new URL(url)
                          const origin = urlObj.origin
                          const isProxyUrl = url.includes('?origin=') || url.includes('?xs=')
                          const availability = serverAvailability.get(origin)

                          // Determine icon based on availability
                          let statusIcon
                          let statusColor
                          let statusText

                          if (availability && !isProxyUrl) {
                            switch (availability.status) {
                              case 'checking':
                                statusIcon = (
                                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                                )
                                statusColor = 'text-blue-500'
                                statusText = 'Checking...'
                                break
                              case 'available':
                                statusIcon = <Check className="w-4 h-4 text-green-500 shrink-0" />
                                statusColor = 'text-green-500'
                                statusText = availability.contentLength
                                  ? `Available (${(availability.contentLength / 1024 / 1024).toFixed(2)} MB)`
                                  : 'Available'
                                break
                              case 'unavailable':
                                statusIcon = <X className="w-4 h-4 text-red-500 shrink-0" />
                                statusColor = 'text-red-500'
                                statusText = `Not found (${availability.statusCode})`
                                break
                              case 'error':
                                statusIcon = <X className="w-4 h-4 text-orange-500 shrink-0" />
                                statusColor = 'text-orange-500'
                                statusText = 'Connection error'
                                break
                            }
                          } else {
                            statusIcon = (
                              <Circle className="w-4 h-4 text-muted-foreground mt-1 shrink-0" />
                            )
                          }

                          return (
                            <li key={idx} className="break-all">
                              <div className="flex items-start gap-2">
                                {statusIcon}
                                <div className="flex-1">
                                  <code className="text-xs block mb-1">{origin}</code>
                                  {isBlossomUrl && (
                                    <div className="text-xs text-muted-foreground">
                                      SHA256: {sha256?.slice(0, 16)}...
                                      {isProxyUrl && (
                                        <span className="ml-2 text-purple-500">(proxy)</span>
                                      )}
                                    </div>
                                  )}
                                  {availability && statusText && !isProxyUrl && (
                                    <div className={`text-xs ${statusColor} font-medium`}>
                                      {statusText}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </li>
                          )
                        } catch {
                          return (
                            <li key={idx} className="break-all text-red-500">
                              <X className="w-4 h-4 text-red-500 inline-block mr-1" /> Invalid URL
                            </li>
                          )
                        }
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No URLs available</p>
                  )}
                </div>

                {/* Configured Blossom Servers */}
                <div>
                  <h4 className="text-sm font-medium mb-2">
                    Configured Blossom Servers ({blossomServers?.length || 0})
                    {videoHash.sha256 && videoHash.ext && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        Checking for {videoHash.sha256.slice(0, 8)}...{videoHash.ext}
                      </span>
                    )}
                  </h4>
                  {blossomServers && blossomServers.length > 0 ? (
                    <ul className="space-y-2 text-sm">
                      {blossomServers.map((server, idx) => {
                        const availability = serverAvailability.get(server.url)

                        // Determine icon and color based on status
                        let statusIcon
                        let statusColor
                        let statusText

                        if (availability) {
                          switch (availability.status) {
                            case 'checking':
                              statusIcon = (
                                <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                              )
                              statusColor = 'text-blue-500'
                              statusText = 'Checking...'
                              break
                            case 'available':
                              statusIcon = <Check className="w-4 h-4 text-green-500 shrink-0" />
                              statusColor = 'text-green-500'
                              statusText = availability.contentLength
                                ? `Available (${(availability.contentLength / 1024 / 1024).toFixed(2)} MB)`
                                : 'Available'
                              break
                            case 'unavailable':
                              statusIcon = <X className="w-4 h-4 text-red-500 shrink-0" />
                              statusColor = 'text-red-500'
                              statusText = `Not found (${availability.statusCode})`
                              break
                            case 'error':
                              statusIcon = <X className="w-4 h-4 text-orange-500 shrink-0" />
                              statusColor = 'text-orange-500'
                              statusText = 'Connection error'
                              break
                          }
                        } else {
                          statusIcon = <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
                          statusColor = 'text-muted-foreground'
                          statusText = 'Not checked'
                        }

                        return (
                          <li key={idx} className="flex items-center gap-2">
                            {statusIcon}
                            <div className="flex-1">
                              <code className="text-xs">{server.url}</code>
                              <div className="text-xs text-muted-foreground">
                                {server.name} • Tags: {server.tags.join(', ')}
                              </div>
                              {availability && statusText && (
                                <div className={`text-xs ${statusColor} font-medium`}>
                                  {statusText}
                                </div>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No blossom servers configured</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
