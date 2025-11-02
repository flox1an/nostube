import { useParams, Link, useLocation, useNavigate } from 'react-router-dom'
import { useEventStore } from 'applesauce-react/hooks'
import { useObservableState } from 'observable-hooks'
import { of } from 'rxjs'
import { switchMap, catchError } from 'rxjs/operators'
import { VideoPlayer } from '@/components/VideoPlayer'
import { VideoComments } from '@/components/VideoComments'
import { VideoSuggestions } from '@/components/VideoSuggestions'

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { formatDistance } from 'date-fns'
import { Separator } from '@/components/ui/separator'
import { useEffect, useState, useMemo, useRef } from 'react'
import { processEvent } from '@/utils/video-event'
import { nip19 } from 'nostr-tools'
import { EventPointer } from 'nostr-tools/nip19'
import { Skeleton } from '@/components/ui/skeleton'
import { CollapsibleText } from '@/components/ui/collapsible-text'
import { useAppContext } from '@/hooks/useAppContext'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { useNostrPublish } from '@/hooks/useNostrPublish'
import { MoreVertical, TrashIcon } from 'lucide-react'
import { imageProxy, nowInSecs } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useProfile } from '@/hooks/useProfile'
import { createEventLoader } from 'applesauce-loaders/loaders'
import { AddToPlaylistButton } from '@/components/AddToPlaylistButton'
import { ButtonWithReactions } from '@/components/ButtonWithReactions'
import ShareButton from '@/components/ShareButton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle, Loader2 } from 'lucide-react'
import { mirrorBlobsToServers } from '@/lib/blossom-upload'
import { extractBlossomHash } from '@/utils/video-event'
import { BlobDescriptor } from 'blossom-client-sdk'
import { useMissingVideos } from '@/hooks/useMissingVideos'

// Custom hook for debounced play position storage
function useDebouncedPlayPositionStorage(
  playPos: number,
  user: { pubkey: string } | undefined,
  videoId: string | undefined
) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastWriteRef = useRef<number>(0)
  useEffect(() => {
    if (!user || !videoId) return
    if (playPos < 5) return
    const key = `playpos:${user.pubkey}:${videoId}`
    const now = Date.now()
    // If last write was more than 3s ago, write immediately
    if (now - lastWriteRef.current > 3000) {
      localStorage.setItem(key, String(playPos))
      lastWriteRef.current = now
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    } else {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      debounceRef.current = setTimeout(() => {
        localStorage.setItem(key, String(playPos))
        lastWriteRef.current = Date.now()
        debounceRef.current = null
      }, 2000)
    }
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [playPos, user, videoId])
}

// Utility to parse t= parameter (supports seconds, mm:ss, h:mm:ss)
function parseTimeParam(t: string | null): number {
  if (!t) return 0
  if (/^\d+$/.test(t)) {
    // Simple seconds
    return parseInt(t, 10)
  }
  // mm:ss or h:mm:ss
  const parts = t.split(':').map(Number)
  if (parts.some(isNaN)) return 0
  if (parts.length === 2) {
    // mm:ss
    return parts[0] * 60 + parts[1]
  }
  if (parts.length === 3) {
    // h:mm:ss
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  return 0
}

export function VideoPage() {
  const { config } = useAppContext()
  const { nevent } = useParams<{ nevent: string }>()
  const eventStore = useEventStore()
  const { pool } = useAppContext()
  const navigate = useNavigate()
  const eventPointer = useMemo(() => nip19.decode(nevent ?? '').data as EventPointer, [nevent])
  const { markVideoAsMissing, clearMissingVideo, isVideoMissing } = useMissingVideos()

  const loader = useMemo(() => createEventLoader(pool, { eventStore }), [pool, eventStore])

  // Use EventStore to get the video event with fallback to loader
  const videoObservable = useMemo(() => {
    return eventStore.event(eventPointer.id).pipe(
      switchMap(event => {
        if (event) {
          return of(event)
        }
        // If no event in store, fallback to loader
        return loader(eventPointer)
      }),
      catchError(() => {
        // If eventStore fails, fallback to loader
        return loader(eventPointer)
      })
    )
  }, [eventStore, loader, eventPointer])

  const videoEvent = useObservableState(videoObservable)

  // Process the video event or get from cache
  const video = useMemo(() => {
    if (!nevent) return null

    // If we have the event from EventStore, process it
    if (videoEvent) {
      const processedEvent = processEvent(videoEvent, [], config.blossomServers) // TODO use currect relays from eventstore
      return processedEvent
    }

    return null
  }, [nevent, videoEvent, config.blossomServers])

  const isLoading = !video && videoEvent === undefined

  const metadata = useProfile({ pubkey: video?.pubkey || '' })
  const authorName = metadata?.display_name || metadata?.name || video?.pubkey?.slice(0, 8) || ''

  useEffect(() => {
    console.log(video)
  }, [video])

  useEffect(() => {
    if (video?.title) {
      document.title = `${video.title} - nostube`
    } else {
      document.title = 'nostube'
    }
    return () => {
      document.title = 'nostube'
    }
  }, [video?.title])

  const [shareOpen, setShareOpen] = useState(false)
  const [includeTimestamp, setIncludeTimestamp] = useState(false)
  const [currentPlayPos, setCurrentPlayPos] = useState(0)
  const [isMirroring, setIsMirroring] = useState(false)
  const location = useLocation()

  // Compute initial play position from ?t=... param or localStorage
  const { user } = useCurrentUser()
  const { publish, isPending: isDeleting } = useNostrPublish()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const initialPlayPos = useMemo(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(location.search)
      const tRaw = params.get('t')
      const t = parseTimeParam(tRaw)
      if (t > 0) return t
    }
    if (user && video) {
      const key = `playpos:${user.pubkey}:${video.id}`
      const saved = localStorage.getItem(key)
      if (saved) {
        const time = parseFloat(saved)
        if (
          !isNaN(time) &&
          video.duration &&
          video.duration - time > 5 &&
          time < video.duration - 1
        ) {
          // Only restore if more than 5 seconds left and not at the end
          return time
        }
      }
    }
    return 0
  }, [user, video, location.search])

  // Scroll to top when video is loaded
  useEffect(() => {
    if (video) {
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [video, initialPlayPos])

  // Use the custom hook for debounced play position storage
  useDebouncedPlayPositionStorage(currentPlayPos, user, video?.id)

  // Helper to encode URI components
  function encode(val: string): string {
    return encodeURIComponent(val)
  }

  // Get current video time in seconds
  function getCurrentTime() {
    return Math.floor(currentPlayPos)
  }

  // Check if video is only available on 1 blossom server
  const blossomServerCount = useMemo(() => {
    if (!video || !video.urls || video.urls.length === 0) return 0

    // Extract unique blossom server hostnames (exclude proxy URLs which have ?origin=)
    const servers = new Set<string>()

    for (const url of video.urls) {
      // Skip proxy URLs (they have ?origin= query parameter)
      if (url.includes('?origin=')) continue

      try {
        const urlObj = new URL(url)
        const { sha256 } = extractBlossomHash(url)
        // Only count if it's a valid blossom URL (has SHA256 hash)
        if (sha256) {
          servers.add(urlObj.origin)
        }
      } catch {
        // Invalid URL, skip
      }
    }

    return servers.size
  }, [video])

  // Handle mirror action
  const handleMirror = async () => {
    if (!video || !video.urls || video.urls.length === 0 || !user) return

    // Find the first non-proxy blossom URL
    let blossomUrl = ''
    for (const url of video.urls) {
      if (!url.includes('?origin=')) {
        const { sha256 } = extractBlossomHash(url)
        if (sha256) {
          blossomUrl = url
          break
        }
      }
    }

    if (!blossomUrl) return

    const { sha256, ext } = extractBlossomHash(blossomUrl)
    if (!sha256) return

    const blossomMirrorServers = config.blossomServers?.filter(server =>
      server.tags.includes('mirror')
    )

    if (!blossomMirrorServers || blossomMirrorServers.length === 0) {
      // Show toast or message that no mirror servers are configured
      return
    }

    setIsMirroring(true)

    try {
      // Create a BlobDescriptor for the video
      const blob: BlobDescriptor = {
        url: blossomUrl,
        sha256: sha256,
        size: 0, // Size unknown for URL-based videos
        type: video.mimeType || `video/${ext || 'mp4'}`,
        uploaded: Date.now(),
      } as BlobDescriptor

      await mirrorBlobsToServers({
        mirrorServers: blossomMirrorServers.map(s => s.url),
        blob,
        signer: async draft => await user.signer.signEvent(draft),
      })

      // Show success message (you might want to add a toast here)
    } catch (error) {
      console.error('Failed to mirror video:', error)
      // Show error message (you might want to add a toast here)
    } finally {
      setIsMirroring(false)
    }
  }

  // Build share URL
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const videoUrl = `${baseUrl}/video/${nevent || ''}`
  const timestamp = includeTimestamp ? getCurrentTime() : 0
  const shareUrl = timestamp > 0 ? `${videoUrl}?t=${timestamp}` : videoUrl
  const fullUrl = shareUrl
  const title = video?.title || 'Watch this video'
  const thumbnailUrl = video?.images[0] || ''

  const shareLinks = useMemo(() => {
    const eUrl = encode(shareUrl)
    const eFull = encode(fullUrl)
    const eTitle = encode(title)
    const eThumb = encode(thumbnailUrl)
    return {
      mailto: `mailto:?body=${eUrl}`,
      whatsapp: `https://api.whatsapp.com/send/?text=${eTitle}%20${eUrl}`,
      x: `https://x.com/intent/tweet?url=${eUrl}&text=${eTitle}`,
      reddit: `https://www.reddit.com/submit?url=${eFull}&title=${eTitle}`,
      facebook: `https://www.facebook.com/share_channel/?type=reshare&link=${eFull}&display=popup`,
      pinterest: `https://www.pinterest.com/pin/create/button/?url=${eFull}&description=${eTitle}&is_video=true&media=${eThumb}`,
    }
  }, [shareUrl, fullUrl, title, thumbnailUrl])

  if (!isLoading && !video) {
    const isMissing = isVideoMissing(eventPointer.id)
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Alert variant={isMissing ? 'destructive' : 'default'}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>
            {isMissing ? 'Video Unavailable' : 'Video Not Found'}
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-4">
            <p>
              {isMissing
                ? 'This video has been marked as unavailable because it could not be loaded from any source. It will be automatically retried later.'
                : 'This video could not be found. It may have been deleted or the event ID is incorrect.'}
            </p>
            {isMissing && (
              <Button
                onClick={() => {
                  clearMissingVideo(eventPointer.id)
                  window.location.reload()
                }}
                variant="outline"
                className="w-fit"
              >
                Retry Now
              </Button>
            )}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="max-w-[140rem] mx-auto sm:py-4">
      {/*video && (
        <div className="md:px-6 lg:flex-row">
          <VideoPlayer
            urls={video.urls}
            textTracks={video.textTracks}
            mime={video.mimeType || ''}
            poster={video.images[0] || ''}
            loop={[34236, 22].includes(video?.kind || 0)}
            className="w-full max-h-[80dvh] aspect-video rounded-lg"
            onTimeUpdate={setCurrentPlayPos}
            initialPlayPos={initialPlayPos}
          />
        </div>
      )*/}
      <div className="flex gap-6 md:px-6 flex-col lg:flex-row">
        <div className="flex-1">
          {isLoading ? (
            <div>
              <Skeleton className="w-full aspect-video" />

              <div className="flex flex-col gap-4">
                <Skeleton className="mt-4 h-8 w-3/4" />
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <Skeleton className="h-9 w-9 rounded-full" />
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-1/4" />
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-6 w-16" />
                    ))}
                  </div>
                  <Skeleton className="h-20 w-full" />
                </div>
              </div>
            </div>
          ) : (
            video &&
            video.urls.length > 0 && (
              <div>
                <VideoPlayer
                  urls={video.urls}
                  textTracks={video.textTracks}
                  mime={video.mimeType || ''}
                  poster={video.images[0] || ''}
                  loop={[34236, 22].includes(video?.kind || 0)}
                  className="w-full max-h-[80dvh] aspect-video rounded-lg"
                  onTimeUpdate={setCurrentPlayPos}
                  initialPlayPos={initialPlayPos}
                  contentWarning={video.contentWarning}
                  onAllSourcesFailed={(urls) => markVideoAsMissing(video.id, urls)}
                />
                <div className="flex flex-col gap-4 p-4">
                  {video?.title && <h1 className="text-2xl font-bold">{video?.title}</h1>}

                  <div className="flex items-start justify-between">
                    <Link
                      to={`/author/${nip19.npubEncode(video?.pubkey || '')}`}
                      className="flex items-center gap-4"
                    >
                      <Avatar>
                        <AvatarImage src={imageProxy(metadata?.picture)} />
                        <AvatarFallback>{authorName[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-semibold">{authorName}</div>
                        <div className="text-sm text-muted-foreground">
                          {video?.created_at &&
                            formatDistance(new Date(video.created_at * 1000), new Date(), {
                              addSuffix: true,
                            })}
                        </div>
                      </div>
                    </Link>

                    <div className="flex items-center gap-2">
                      <AddToPlaylistButton
                        videoId={video.id}
                        videoKind={video.kind}
                        videoTitle={video.title}
                      />
                      <ButtonWithReactions
                        eventId={video.id}
                        authorPubkey={video.pubkey}
                        kind={video.kind}
                      />
                      {/*
                      <FollowButton pubkey={video.pubkey} />*/}
                      <ShareButton
                        shareOpen={shareOpen}
                        setShareOpen={setShareOpen}
                        shareUrl={shareUrl}
                        includeTimestamp={includeTimestamp}
                        setIncludeTimestamp={setIncludeTimestamp}
                        shareLinks={shareLinks}
                      />
                      {/* Dropdown menu for video actions */}
                      {user?.pubkey === video.pubkey && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="secondary" aria-label="More actions">
                              <MoreVertical className="w-5 h-5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" side="top">
                            <DropdownMenuItem onSelect={() => setShowDeleteDialog(true)}>
                              <TrashIcon className="w-5 h-5" />
                              &nbsp; Delete Video
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/*video &&
                    (video.dimensions || (video.size && video.size > 0)) && (
                      <div className="text-sm text-muted-foreground space-x-4">
                        {video.dimensions && <span>{video.dimensions}</span>}
                        {video.size && video.size > 0 && (
                          <span>{formatFileSize(video.size)}</span>
                        )}
                      </div>
                    )*/}

                  {video && video.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {video.tags.slice(20).map(tag => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {video?.description && (
                    <CollapsibleText text={video.description} className="text-muted-foreground" />
                  )}
                </div>
                {/* Delete confirmation dialog */}
                <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Video?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this video? This action cannot be undone. A
                        deletion event will be published to all relays.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700"
                        disabled={isDeleting}
                        onClick={async () => {
                          if (!video) return
                          await publish({
                            event: {
                              kind: 5, // NIP-9 deletion event
                              content: 'Deleted by author',
                              tags: [['e', video.id]],
                              created_at: nowInSecs(),
                            },
                            relays: config.relays.map(r => r.url),
                          })
                          setShowDeleteDialog(false)
                          navigate('/')
                        }}
                      >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )
          )}

          {video && (
            <div className="p-4">
              <VideoComments videoId={video.id} authorPubkey={video.pubkey} link={video.link} />
            </div>
          )}
        </div>

        <div className="w-full lg:w-96 p-2 md:p-0 space-y-4">
          {video && blossomServerCount === 1 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Limited Availability</AlertTitle>
              <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <span className="flex-1">
                  This video is only available on 1 blossom server. Consider mirroring it to your
                  servers.
                </span>
                <Button
                  onClick={handleMirror}
                  disabled={isMirroring || !user}
                  size="sm"
                  className="sm:ml-4 shrink-0 sm:self-center"
                >
                  {isMirroring ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Mirroring...
                    </>
                  ) : (
                    'Mirror'
                  )}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <VideoSuggestions
            currentVideoId={video?.id}
            authorPubkey={video?.pubkey}
            currentVideoType={video?.type}
          />
        </div>
      </div>
    </div>
  )
}
