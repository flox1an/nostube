import { useState, useEffect } from 'react'
import { useMissingVideos } from '@/hooks/useMissingVideos'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { formatDistance } from 'date-fns'
import { RefreshCw, Trash2 } from 'lucide-react'

export function MissingVideosSection() {
  const { getAllMissingVideos, clearMissingVideo, clearAllMissing, getMissingCount } =
    useMissingVideos()

  const missingVideos = getAllMissingVideos()
  const missingCount = getMissingCount()
  const entries = Object.entries(missingVideos)

  // Use state for current time to avoid impure function calls during render
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    // Update every minute to refresh retry status
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  const formatRetryTime = (retryAfter: number | undefined) => {
    if (!retryAfter) return 'Unknown'
    if (now >= retryAfter) return 'Ready to retry'
    return `Retry in ${formatDistance(retryAfter, now)}`
  }

  const getStatusBadge = (video: {
    failedAt: number
    retryAfter?: number
    attemptCount: number
  }) => {
    const isPermanent = now - video.failedAt > 7 * 24 * 60 * 60 * 1000 // 7 days

    if (isPermanent) {
      return <Badge variant="destructive">Permanent</Badge>
    }

    if (video.retryAfter && now >= video.retryAfter) {
      return (
        <Badge variant="default" className="bg-green-500">
          Ready to Retry
        </Badge>
      )
    }

    return <Badge variant="secondary">Cooldown</Badge>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Missing Videos</span>
          {missingCount > 0 && (
            <Badge variant="outline" className="ml-2">
              {missingCount} filtered
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Videos that failed to load from all sources are automatically filtered from your feed.
          They will be retried automatically based on the schedule below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {entries.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No missing videos. All videos are loading successfully!
            </p>
          ) : (
            <>
              <ScrollArea className="w-full rounded-md border p-4 max-h-96">
                <ul className="space-y-3">
                  {entries.map(([videoId, video]) => (
                    <li
                      key={videoId}
                      className="flex items-start justify-between gap-4 p-3 rounded-lg border"
                    >
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-xs font-mono bg-muted px-2 py-1 rounded truncate max-w-[300px]">
                            {videoId}
                          </code>
                          {getStatusBadge(video)}
                        </div>
                        <div className="text-sm space-y-1">
                          <p className="text-muted-foreground">
                            Failed: {formatDistance(video.failedAt, now, { addSuffix: true })}
                          </p>
                          <p className="text-muted-foreground">
                            Attempts: {video.attemptCount} • {formatRetryTime(video.retryAfter)}
                          </p>
                          <details className="text-xs text-muted-foreground">
                            <summary className="cursor-pointer hover:text-foreground">
                              Show URLs ({video.urls.length})
                            </summary>
                            <ul className="mt-2 space-y-1 pl-4">
                              {video.urls.map((url, i) => (
                                <li key={i} className="truncate" title={url}>
                                  {url}
                                </li>
                              ))}
                            </ul>
                          </details>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            clearMissingVideo(videoId)
                          }}
                          title="Retry now"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => clearMissingVideo(videoId)}
                          title="Remove from list"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>

              <div className="flex gap-2">
                <Button variant="outline" onClick={clearAllMissing} className="w-full">
                  Clear All ({entries.length})
                </Button>
              </div>

              <div className="text-sm text-muted-foreground space-y-1 p-4 bg-muted rounded-lg">
                <p className="font-semibold">Retry Schedule:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>1st failure: Retry after 1 hour</li>
                  <li>2nd failure: Retry after 6 hours</li>
                  <li>3rd+ failures: Retry after 24 hours</li>
                  <li>After 7 days: Marked as permanently unavailable</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
