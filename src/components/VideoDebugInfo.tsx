import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { extractBlossomHash } from '@/utils/video-event'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { Check, Circle } from 'lucide-react'
import type { NostrEvent } from 'nostr-tools'
import type { BlossomServer } from '@/contexts/AppContext'
import type { VideoEvent } from '@/utils/video-event'

interface VideoDebugInfoProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  videoEvent: NostrEvent | null | undefined
  video: VideoEvent | null
  blossomServers?: BlossomServer[]
}

export function VideoDebugInfo({ open, onOpenChange, videoEvent, video, blossomServers }: VideoDebugInfoProps) {
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
                  <h4 className="text-sm font-medium mb-2">Original URLs ({video?.urls.length || 0})</h4>
                  {video && video.urls.length > 0 ? (
                    <ul className="space-y-2 text-sm">
                      {video.urls.map((url, idx) => {
                        const { sha256 } = extractBlossomHash(url)
                        const isBlossomUrl = Boolean(sha256)
                        try {
                          const urlObj = new URL(url)
                          const origin = urlObj.origin
                          const isProxyUrl = url.includes('?origin=') || url.includes('?xs=')
                          return (
                            <li key={idx} className="break-all">
                              <div className="flex items-start gap-2">
                                <Circle className="w-4 h-4 text-muted-foreground mt-1 shrink-0" />
                                <div className="flex-1">
                                  <code className="text-xs block mb-1">{origin}</code>
                                  {isBlossomUrl && (
                                    <div className="text-xs text-muted-foreground">
                                      SHA256: {sha256?.slice(0, 16)}...
                                      {isProxyUrl && <span className="ml-2 text-purple-500">(proxy)</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </li>
                          )
                        } catch {
                          return (
                            <li key={idx} className="break-all text-red-500">
                              <span className="text-red-500">✗</span> Invalid URL
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
                  </h4>
                  {blossomServers && blossomServers.length > 0 ? (
                    <ul className="space-y-2 text-sm">
                      {blossomServers.map((server, idx) => {
                        // Check if this server has the video
                        const hasVideo = video?.urls.some(url => {
                          try {
                            const urlObj = new URL(url)
                            return urlObj.origin === new URL(server.url).origin
                          } catch {
                            return false
                          }
                        })
                        return (
                          <li key={idx} className="flex items-center gap-2">
                            {hasVideo ? (
                              <Check className="w-4 h-4 text-green-500 shrink-0" />
                            ) : (
                              <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                            <div className="flex-1">
                              <code className="text-xs">{server.url}</code>
                              <div className="text-xs text-muted-foreground">
                                {server.name} • Tags: {server.tags.join(', ')}
                              </div>
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
