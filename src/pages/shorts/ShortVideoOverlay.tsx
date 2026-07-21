/**
 * Short Video Overlay Component
 *
 * Renders the interactive overlay for a short video: action buttons (reactions,
 * comments, share, report) and the bottom info bar (author, title, tags).
 *
 * Intentionally rendered in ShortsVideoPage at z-20, ABOVE the singleton
 * <video> element (z-10) and the slide thumbnail backgrounds (z-auto). This
 * guarantees buttons stay tappable on all platforms, including iOS where CSS
 * `contain: paint` on the slide wrappers would otherwise trap any z-index set
 * inside them below the z-10 video overlay.
 *
 * Root is `pointer-events-none`; only the action sidebar and bottom bar have
 * `pointer-events-auto` so that transparent areas pass taps through to the
 * video element for play/pause toggling.
 */
import { Link } from 'react-router-dom'
import { useEventStore } from 'applesauce-react/hooks'
import { useTranslation } from 'react-i18next'
import { VideoReactionButtons } from '@/components/VideoReactionButtons'
import { FollowButton } from '@/components/FollowButton'
import { UserAvatar } from '@/components/UserAvatar'
import { Button } from '@/components/ui/button'
import { formatDistance } from 'date-fns/formatDistance'
import { memo, useEffect, useMemo, useState } from 'react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import {
  type VideoEvent,
  getPublishDate,
  generateEventLink,
  buildEventRelays,
} from '@/utils/video-event'
import { buildVideoPath } from '@/utils/video-utils'
import { decodeVideoEventIdentifier } from '@/lib/nip19'
import { useProfile, useReadRelays, useCommentCount, usePreloadVideoData } from '@/hooks'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { MessageCircle, Share2, ExternalLink, Flag, Volume2, VolumeX } from 'lucide-react'
import { ReportDialog } from '@/components/ReportDialog'
import { combineRelays } from '@/lib/utils'
import { buildProfileUrl } from '@/lib/nprofile'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { VideoComments } from '@/components/VideoComments'
import { presetRelays } from '@/constants/relays'
import { getDateLocale } from '@/lib/date-locale'

// Module-scope constant — avoids recreation on every render.
const PRESET_RELAY_URLS = presetRelays.map(relay => relay.url)

interface ShortVideoOverlayProps {
  video: VideoEvent
  /** Whether the singleton short-video player is muted. */
  isMuted: boolean
  /** Toggles audio for the singleton short-video player. */
  onToggleMute: () => void
  /** maxWidth matching the singleton <video> element, e.g. 'calc(100vh * 9 / 16)' */
  maxWidth: string
}

export const ShortVideoOverlay = memo(
  function ShortVideoOverlay({ video, isMuted, onToggleMute, maxWidth }: ShortVideoOverlayProps) {
    const { i18n } = useTranslation()
    const dateLocale = getDateLocale(i18n.language)
    const metadata = useProfile({ pubkey: video.pubkey })
    const authorName = metadata?.display_name || metadata?.name || video?.pubkey?.slice(0, 8) || ''
    const authorPicture = metadata?.picture
    const eventStore = useEventStore()
    const userReadRelays = useReadRelays()
    const [commentsOpen, setCommentsOpen] = useState(false)
    const [showReportDialog, setShowReportDialog] = useState(false)
    const [muted, setMuted] = useState(isMuted)
    useEffect(() => setMuted(isMuted), [isMuted])
    const { user } = useCurrentUser()
    const commentCount = useCommentCount({ videoId: video.id })

    const event = useMemo(() => eventStore.getEvent(video.id), [eventStore, video.id])

    const authorProfileUrl = useMemo(
      () => buildProfileUrl(video.pubkey, event),
      [video.pubkey, event]
    )

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

    // Preload reactions and comments for the current video.
    usePreloadVideoData({
      videoId: video.id,
      authorPubkey: video.pubkey,
      kind: video.kind,
      relays: reactionRelays,
      enabled: true,
    })

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

    const freshLink = useMemo(() => {
      if (!event) return video.link
      const identifier = event.tags.find(t => t[0] === 'd')?.[1]
      const relays = buildEventRelays(event, pointerRelays)
      return generateEventLink(event, identifier, relays)
    }, [event, video.link, pointerRelays])

    const shareUrl = `${baseUrl}${buildVideoPath(freshLink, 'shorts')}`

    return (
      <div className="relative w-full h-full pointer-events-none">
        {/* Action sidebar — right rail, TikTok-style */}
        <div
          className="absolute right-4 md:right-0 flex flex-col items-center gap-3 md:gap-4 pointer-events-auto md:pr-8 pb-8 [&_.rounded-full.bg-secondary]:bg-secondary/50"
          style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <VideoReactionButtons
            eventId={video.id}
            kind={video.kind}
            authorPubkey={video.pubkey}
            relays={reactionRelays}
            identifier={video.identifier}
          />

          {/* Comments */}
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

          {/* Share */}
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
          </div>

          {/* Report (logged-in users only) */}
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
          {/* Audio */}
          <div className="flex flex-col items-center gap-1">
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full"
              onClick={() => {
                setMuted(previousMuted => !previousMuted)
                onToggleMute()
              }}
              aria-label={muted ? 'Unmute video' : 'Mute video'}
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Bottom info bar */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 md:px-8 md:pb-8 bg-linear-to-t from-black/80 via-black/40 to-transparent pointer-events-auto">
          <div className="w-full" style={{ maxWidth }}>
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

            <div className="text-white my-2 line-clamp-3">{video.title || video.description}</div>

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
          {/* Safe-area spacer for the iOS home indicator */}
          <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} aria-hidden="true" />
        </div>

        {/* Dialogs — rendered as portals so they are unaffected by z-index */}
        <ReportDialog
          open={showReportDialog}
          onOpenChange={setShowReportDialog}
          reportType="video"
          contentId={video.id}
          contentAuthor={video.pubkey}
        />

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
  (prevProps, nextProps) =>
    prevProps.video.id === nextProps.video.id && prevProps.maxWidth === nextProps.maxWidth
)
