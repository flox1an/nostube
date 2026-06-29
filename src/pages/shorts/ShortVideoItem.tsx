/**
 * Short Video Item Component
 *
 * Renders the non-media chrome for a short: poster fallback, reactions, author info,
 * comments, sharing, reporting, and metadata. Playback is owned by the singleton
 * video element in ShortsVideoPage.
 */

import { Link } from 'react-router-dom'
import { useEventStore } from 'applesauce-react/hooks'
import { useTranslation } from 'react-i18next'
import { VideoReactionButtons } from '@/components/VideoReactionButtons'
import { FollowButton } from '@/components/FollowButton'
import { UserAvatar } from '@/components/UserAvatar'
import { Button } from '@/components/ui/button'
import { formatDistance } from 'date-fns/formatDistance'
import { memo, useState, useMemo, useCallback } from 'react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import {
  type VideoEvent,
  getPublishDate,
  generateEventLink,
  buildEventRelays,
} from '@/utils/video-event'
import { buildVideoPath } from '@/utils/video-utils'
import { decodeVideoEventIdentifier } from '@/lib/nip19'
import {
  useAppContext,
  useProfile,
  useReadRelays,
  useCommentCount,
  usePreloadVideoData,
} from '@/hooks'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { MessageCircle, Share2, ExternalLink, Flag } from 'lucide-react'
import { ReportDialog } from '@/components/ReportDialog'
import { combineRelays } from '@/lib/utils'
import { useImageCascade } from '@/hooks/useImageCascade'
import { buildProfileUrl } from '@/lib/nprofile'
import { useValidUrl } from '@/hooks/useValidUrl'
import { UserBlossomServersModel } from 'applesauce-common/models'
import { useEventModel } from 'applesauce-react/hooks'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { VideoComments } from '@/components/VideoComments'
import { presetRelays } from '@/constants/relays'
import { getDateLocale } from '@/lib/date-locale'

// Extract preset relay URLs at module level to avoid recreation on every render
const PRESET_RELAY_URLS = presetRelays.map(relay => relay.url)

export interface ShortVideoItemProps {
  video: VideoEvent
  isActive: boolean
  registerIntersectionRef?: (element: HTMLDivElement | null) => void
}

function dimensionsToAspectRatio(dimensions?: string): number | null {
  if (!dimensions) return null

  const match = /^(\d+)x(\d+)$/i.exec(dimensions.trim())
  if (!match) return null

  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null

  return width / height
}

function maxWidthForAspectRatio(aspectRatio: number | null): string {
  if (!aspectRatio) return 'calc(100vh * 9 / 16)' // Default for vertical

  if (aspectRatio >= 0.9 && aspectRatio <= 1.1) {
    // Square video (1:1 ratio, with some tolerance)
    return '85vh'
  }

  if (aspectRatio > 1.1) {
    // Wider than square (landscape)
    return '95vh'
  }

  // Vertical video
  return 'calc(100vh * 9 / 16)'
}

// Memoized component to prevent re-renders when props haven't changed
export const ShortVideoItem = memo(
  function ShortVideoItem({ video, isActive, registerIntersectionRef }: ShortVideoItemProps) {
    const { i18n } = useTranslation()
    const dateLocale = getDateLocale(i18n.language)
    const metadata = useProfile({ pubkey: video.pubkey })
    const authorName = metadata?.display_name || metadata?.name || video?.pubkey?.slice(0, 8) || ''
    const authorPicture = metadata?.picture
    const eventStore = useEventStore()
    const userReadRelays = useReadRelays()
    const { config } = useAppContext()
    const [commentsOpen, setCommentsOpen] = useState(false)
    const [showReportDialog, setShowReportDialog] = useState(false)
    const { user } = useCurrentUser()

    // Get comment count
    const commentCount = useCommentCount({ videoId: video.id })

    // Get video owner's Blossom servers
    const rawOwnerServersResult = useEventModel(
      UserBlossomServersModel,
      video.pubkey ? [video.pubkey] : null
    )
    const rawOwnerServers = useMemo(() => rawOwnerServersResult || [], [rawOwnerServersResult])

    // Combine config Blossom servers with video owner's servers
    const allBlossomServers = useMemo(() => {
      const ownerServers = (rawOwnerServers || []).map(url => url.toString())
      const configServers = config.blossomServers?.map(s => s.url) || []
      // Owner servers first (more likely to have the file), then config servers
      return [...ownerServers, ...configServers]
    }, [rawOwnerServers, config.blossomServers])

    // Validate thumbnail URLs with Blossom server fallbacks
    const { validUrl: thumbnailUrl } = useValidUrl({
      urls: video.images,
      blossomServers: allBlossomServers,
      resourceType: 'image',
      enabled: true,
    })

    // Cascade falls back from proxy → raw → ImageOff. The shorts poster comes from a single
    // image source; there is no separate video-frame fallback because the singleton <video>
    // shows a frame once it loads.
    const thumbnailCascade = useImageCascade({ src: thumbnailUrl, variant: 'preview' })

    // Get the event from store to access seenRelays
    const event = useMemo(() => eventStore.getEvent(video.id), [eventStore, video.id])
    const authorProfileUrl = useMemo(
      () => buildProfileUrl(video.pubkey, event),
      [video.pubkey, event]
    )

    // Get relays from event's seenRelays
    const eventRelays = useMemo(() => {
      if (!event) return []
      const seenRelays = getSeenRelays(event)
      return seenRelays ? Array.from(seenRelays) : []
    }, [event])

    const pointerRelays = useMemo(() => {
      if (!video.link) return []
      try {
        const identifier = decodeVideoEventIdentifier(video.link)
        if (!identifier) return []
        const relays =
          identifier.type === 'event'
            ? identifier.data?.relays
            : identifier.type === 'address'
              ? identifier.data?.relays
              : undefined
        return relays ? [...relays] : []
      } catch {
        return []
      }
    }, [video.link])

    const reactionRelays = useMemo(
      () => combineRelays([eventRelays, pointerRelays, userReadRelays, PRESET_RELAY_URLS]),
      [eventRelays, pointerRelays, userReadRelays]
    )

    // Preload reactions and comments for this video when it is close enough to be rendered
    usePreloadVideoData({
      videoId: video.id,
      authorPubkey: video.pubkey,
      kind: video.kind,
      relays: reactionRelays,
      enabled: isActive,
    })

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    // Compute fresh link with up-to-date seen relays (not stale from processEvent)
    const freshLink = (() => {
      if (!event) return video.link
      const identifier = event.tags.find(t => t[0] === 'd')?.[1]
      const relays = buildEventRelays(event, pointerRelays)
      return generateEventLink(event, identifier, relays)
    })()
    const shareUrl = `${baseUrl}${buildVideoPath(freshLink, 'shorts')}`

    const aspectRatio = useMemo(() => dimensionsToAspectRatio(video.dimensions), [video.dimensions])
    const maxWidth = useMemo(() => maxWidthForAspectRatio(aspectRatio), [aspectRatio])

    const handleRootRef = useCallback(
      (node: HTMLDivElement | null) => {
        if (registerIntersectionRef) {
          registerIntersectionRef(node)
        }
      },
      [registerIntersectionRef]
    )

    return (
      <div
        ref={handleRootRef}
        data-video-id={video.id}
        className="min-h-screen h-screen w-full flex items-center justify-center bg-black"
        style={{ contain: 'layout style paint' }}
      >
        <div className="relative w-full h-screen flex flex-col md:flex-row items-center justify-center">
          {/* Poster / video backdrop. The real <video> is rendered once by ShortsVideoPage. */}
          <div className="relative w-full md:flex-1 h-full flex items-center justify-center bg-black">
            <div className="relative w-full h-full" style={{ maxWidth }}>
              {video.contentWarning && !isActive && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/80 rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white drop-shadow-lg">
                      Content warning
                    </div>
                    <div className="text-base font-semibold text-white drop-shadow-lg mt-4">
                      {video.contentWarning}
                    </div>
                  </div>
                </div>
              )}
              <div className="relative w-full h-full">
                {thumbnailCascade.src && (
                  <div className="absolute inset-0 overflow-hidden bg-black flex items-center justify-center">
                    <img
                      src={thumbnailCascade.src}
                      alt={video.title}
                      className="w-full h-full object-contain"
                      loading={isActive ? 'eager' : 'lazy'}
                      referrerPolicy="no-referrer"
                      onError={thumbnailCascade.onError}
                      onLoad={thumbnailCascade.onLoad}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right sidebar with interactions - mobile: absolute overlay, desktop: relative right side */}
          <div className="absolute bottom-24 right-4 md:right-0 flex flex-col items-center gap-4 z-20 md:pr-8 pb-8">
            {/* Upvote and Downvote buttons */}
            <VideoReactionButtons
              eventId={video.id}
              kind={video.kind}
              authorPubkey={video.pubkey}
              relays={reactionRelays}
              identifier={video.identifier}
            />

            {/* Comments button */}
            <div className="flex flex-col items-center gap-1">
              <Button
                variant="secondary"
                size="icon"
                className="rounded-full"
                onClick={() => setCommentsOpen(true)}
                aria-label="Comments"
              >
                <MessageCircle className="h-5 w-5" />
              </Button>
              <span className="text-sm font-medium">{commentCount}</span>
            </div>

            {/* Share button */}
            <div className="flex flex-col items-center gap-1">
              <Button
                variant="secondary"
                size="icon"
                className="rounded-full"
                onClick={() => {
                  void navigator.clipboard.writeText(shareUrl)
                }}
                aria-label="Share"
              >
                <Share2 className="h-5 w-5" />
              </Button>
              <span className="text-sm font-medium">Share</span>
            </div>

            {/* Report button */}
            {user && (
              <div className="flex flex-col items-center gap-1">
                <Button
                  variant="secondary"
                  size="icon"
                  className="rounded-full"
                  onClick={() => setShowReportDialog(true)}
                  aria-label="Report"
                >
                  <Flag className="h-5 w-5" />
                </Button>
              </div>
            )}
          </div>

          {/* Bottom info overlay */}
          <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-4 md:px-8 md:pb-8 bg-linear-to-t from-black/80 via-black/40 to-transparent">
            <div className="w-full" style={{ maxWidth }}>
              {/* Follow button and Author info */}
              <div className="flex flex-col gap-4">
                <FollowButton pubkey={video.pubkey} className="text-white self-start" />
                <div className="flex items-center gap-4">
                  <Link to={authorProfileUrl}>
                    <UserAvatar
                      picture={authorPicture}
                      pubkey={video.pubkey}
                      name={authorName}
                      className="h-10 w-10 border-2 border-white"
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link to={authorProfileUrl}>
                      <div className="text-white font-semibold truncate">{authorName}</div>
                    </Link>
                    <div className="text-white/70 text-sm">
                      {formatDistance(new Date(getPublishDate(video) * 1000), new Date(), {
                        addSuffix: true,
                        locale: dateLocale,
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Video title/description */}
              <div className="text-white my-2 line-clamp-3">{video.title || video.description}</div>

              {/* Tags and Origins */}
              {(video.tags.length > 0 || (video.origins && video.origins.length > 0)) && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {video.tags.slice(0, 3).map(tag => (
                    <Link
                      key={tag}
                      to={`/tag/${tag}`}
                      className="text-blue-400 text-sm hover:underline"
                    >
                      #{tag}
                    </Link>
                  ))}
                  {video.origins &&
                    video.origins.map((origin, index) => (
                      <a
                        key={`origin-${index}`}
                        href={origin.originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={origin.platform}
                        className="text-blue-400 text-sm hover:underline inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {origin.platform.charAt(0).toUpperCase() + origin.platform.slice(1)}
                      </a>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Report Dialog */}
        <ReportDialog
          open={showReportDialog}
          onOpenChange={setShowReportDialog}
          reportType="video"
          contentId={video.id}
          contentAuthor={video.pubkey}
        />

        {/* Comments Sheet */}
        <Sheet open={commentsOpen} onOpenChange={setCommentsOpen}>
          <SheetContent side="bottom" className="h-[85vh] overflow-y-auto max-w-2xl mx-auto">
            <SheetHeader>
              <SheetTitle>Comments</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <VideoComments
                videoId={video.id}
                authorPubkey={video.pubkey}
                link={video.link}
                relays={eventRelays}
                videoKind={video.kind}
                identifier={video.identifier}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if essential props changed
    return prevProps.video.id === nextProps.video.id && prevProps.isActive === nextProps.isActive
  }
)
