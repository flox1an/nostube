import React, { useEffect, useMemo, useRef, useState } from 'react'
import { TrustBadge } from '@/components/TrustBadge'
import { useIsMobile } from '@/hooks/useIsMobile'
import { Link } from 'react-router-dom'
import { type NostrEvent } from 'nostr-tools'
import { buildProfileUrlFromPubkey } from '@/lib/nprofile'
import { UserAvatar } from '@/components/UserAvatar'
import { Badge } from '@/components/ui/badge'
import { formatDistance } from 'date-fns/formatDistance'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { CollapsibleText } from '@/components/ui/collapsible-text'
import { useAppContext, useNostrPublish } from '@/hooks'
import { use$, useEventStore } from 'applesauce-react/hooks'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { toast } from 'sonner'
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
import {
  MoreVertical,
  TrashIcon,
  Bug,
  Copy,
  MapPin,
  Pin,
  PinOff,
  Tag,
  Flag,
  Clock,
  Pencil,
  ExternalLink,
  Zap,
} from 'lucide-react'
import { nowInSecs } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { AddToPlaylistButton } from '@/components/AddToPlaylistButton'
import { VideoReactionButtons } from '@/components/VideoReactionButtons'
import ShareButton from '@/components/ShareButton'
import { VideoComments } from '@/components/VideoComments'
import { VideoDebugInfo } from '@/components/VideoDebugInfo'
import type { ContributedVariantDebugRecord } from '@/hooks/useContributedVariants'
import { LabelVideoDialog } from '@/components/LabelVideoDialog'
import { EditVideoDialog } from '@/components/EditVideoDialog'
import { ReportDialog } from '@/components/ReportDialog'
import { type VideoEvent, isAddressableKind, getPublishDate } from '../utils/video-event'
import { type BlossomServer } from '@/contexts/AppContext'
import { cacheEvents } from '@/nostr/core'
import { useTranslation } from 'react-i18next'
import { getDateLocale } from '@/lib/date-locale'
import { isBetaUser } from '@/lib/beta-users'
import { getLanguageDisplay } from '@/lib/language-flags'
import ngeohash from 'ngeohash'

interface ProfileMetadata {
  name?: string
  display_name?: string
  picture?: string
  about?: string
  nip05?: string
  banner?: string
  lud06?: string
  lud16?: string
}

interface VideoInfoSectionProps {
  video: VideoEvent | null
  isLoading: boolean
  metadata: ProfileMetadata | null | undefined
  authorName: string
  relaysToUse: string[]
  userPubkey: string | undefined
  configRelays: { url: string }[]
  configBlossomServers: BlossomServer[]
  videoEvent: NostrEvent | undefined
  shareOpen: boolean
  setShareOpen: (open: boolean) => void
  shareUrl: string
  includeTimestamp: boolean
  setIncludeTimestamp: (include: boolean) => void
  shareLinks: {
    mailto: string
    whatsapp: string
    x: string
    reddit: string
    facebook: string
    pinterest: string
  }
  onDelete?: () => void
  onMirror?: () => void
  onContribute?: () => void
  contributedVariantDebugRecords?: ContributedVariantDebugRecord[]
  userServers?: string[]
  geohash?: string | null
  currentTime?: number // Current video playback position (for timestamped zaps)
}

export const VideoInfoSection = React.memo(function VideoInfoSection({
  video,
  isLoading,
  metadata,
  authorName,
  relaysToUse,
  userPubkey,
  configRelays,
  configBlossomServers,
  videoEvent,
  shareOpen,
  setShareOpen,
  shareUrl,
  includeTimestamp,
  setIncludeTimestamp,
  shareLinks,
  onDelete,
  onMirror,
  onContribute,
  contributedVariantDebugRecords = [],
  userServers,
  geohash,
  currentTime,
}: VideoInfoSectionProps) {
  const { t, i18n } = useTranslation()
  const { publish, isPending: isDeleting } = useNostrPublish()
  const { publish: publishPin, isPending: isPinning } = useNostrPublish()
  const { pool } = useAppContext()
  const eventStore = useEventStore()
  const isMobile = useIsMobile()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDebugDialog, setShowDebugDialog] = useState(false)
  const [showLabelDialog, setShowLabelDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)
  const loadedPinListKeyRef = useRef<string | null>(null)

  // Check if video is editable (owner + addressable event)
  const isOwner = userPubkey === video?.pubkey
  const isEditable = isOwner && video && isAddressableKind(video.kind)

  // Map i18n language codes to date-fns locales
  const dateLocale = getDateLocale(i18n.language)

  const pinFilters = useMemo(
    () => [{ kinds: [10001], authors: userPubkey ? [userPubkey] : [] }],
    [userPubkey]
  )
  const rawPinEvents = use$(() => eventStore.timeline(pinFilters), [eventStore, pinFilters])
  const pinEvents = useMemo(() => rawPinEvents ?? [], [rawPinEvents])
  const pinListEvent = useMemo(
    () => [...pinEvents].sort((a, b) => b.created_at - a.created_at)[0],
    [pinEvents]
  )
  const videoAddress = useMemo(() => {
    if (!video || !isAddressableKind(video.kind) || !video.identifier) return undefined
    return `${video.kind}:${video.pubkey}:${video.identifier}`
  }, [video])
  const matchesCurrentVideoPin = useMemo(
    () => (tag: string[]) => {
      if (!video) return false
      if (tag[0] === 'e' && tag[1] === video.id) return true
      if (tag[0] === 'a' && videoAddress && tag[1] === videoAddress) return true
      return false
    },
    [video, videoAddress]
  )
  const isVideoPinned = useMemo(
    () => Boolean(pinListEvent?.tags.some(matchesCurrentVideoPin)),
    [pinListEvent, matchesCurrentVideoPin]
  )

  useEffect(() => {
    const pinListKey = `${userPubkey ?? ''}:${relaysToUse.join(',')}`
    if (!userPubkey || loadedPinListKeyRef.current === pinListKey) return
    loadedPinListKeyRef.current = pinListKey

    const loader = createTimelineLoader(pool, relaysToUse, pinFilters, { eventStore })
    const sub = loader().subscribe({
      next: event => eventStore.add(event),
      error: () => {},
    })

    return () => sub.unsubscribe()
  }, [userPubkey, pool, relaysToUse, pinFilters, eventStore])

  // Extract expiration timestamp from video event (NIP-40)
  // Calculate once - expiration status won't change during component lifetime
  const expirationTimestamp = videoEvent?.tags.find(tag => tag[0] === 'expiration')?.[1]
  const expirationDate = expirationTimestamp ? new Date(parseInt(expirationTimestamp) * 1000) : null
  const isExpired = expirationDate ? expirationDate < new Date() : false

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 pt-^4">
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
    )
  }

  const hasYouTubeOrigin = video?.origins.some(o => o.platform === 'youtube')
  if (!video || (video.urls.length === 0 && !hasYouTubeOrigin)) return null

  const handleDelete = async () => {
    if (!video) return

    const tags = [
      ['e', video.id],
      ['k', String(video.kind)],
    ]

    if (videoAddress) {
      tags.push(['a', videoAddress])
    }

    const signedDeleteEvent = await publish({
      event: {
        kind: 5,
        content: t('video.deletedByAuthor'),
        tags,
        created_at: nowInSecs(),
      },
      relays: configRelays.map(r => r.url),
    })

    eventStore.add(signedDeleteEvent)
    await cacheEvents([signedDeleteEvent])
    setShowDeleteDialog(false)
    if (onDelete) {
      onDelete()
    }
  }

  const handleToggleProfilePin = async () => {
    if (!video || !userPubkey) return

    const seenRelays = videoEvent ? getSeenRelays(videoEvent) : undefined
    const relayHint = (seenRelays ? Array.from(seenRelays)[0] : undefined) || relaysToUse[0]
    const pinTag =
      videoAddress && isAddressableKind(video.kind)
        ? ['a', videoAddress, relayHint].filter(Boolean)
        : ['e', video.id, relayHint].filter(Boolean)
    const existingTags = pinListEvent?.tags ?? []
    const cleanedTags = existingTags.filter(tag => !matchesCurrentVideoPin(tag))
    const nextTags = isVideoPinned ? cleanedTags : [...cleanedTags, pinTag]

    try {
      await publishPin({
        event: {
          kind: 10001,
          content: pinListEvent?.content ?? '',
          tags: nextTags,
          created_at: nowInSecs(),
        },
        relays: configRelays.map(r => r.url),
      })
      toast.success(
        isVideoPinned
          ? t('video.unpinnedFromProfile', 'Removed from profile pins')
          : t('video.pinnedToProfile', 'Pinned to your profile')
      )
    } catch (error) {
      console.error('Failed to update profile pins:', error)
      toast.error(t('video.profilePinError', 'Failed to update profile pins'))
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 px-2 md:px-0 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {video?.title && (
            <h1 className="text-xl md:text-2xl font-bold line-clamp-2 md:line-clamp-none">
              {video?.title}
            </h1>
          )}
          {expirationDate && !isExpired && (
            <Badge
              variant="secondary"
              className="flex items-center gap-1 text-amber-600 dark:text-amber-400"
            >
              <Clock className="w-3 h-3" />
              {t('video.expiresIn', {
                time: formatDistance(expirationDate, new Date()),
              })}
            </Badge>
          )}
          {isExpired && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {t('video.expired')}
            </Badge>
          )}
        </div>

        <div className="flex flex-col md:flex-row items-start justify-between">
          <Link
            to={buildProfileUrlFromPubkey(video?.pubkey || '', relaysToUse)}
            className="flex items-center gap-4"
          >
            <UserAvatar picture={metadata?.picture} pubkey={video?.pubkey} name={authorName} />
            <div>
              <div className="flex items-center gap-1.5 font-semibold">
                {authorName}
                {video?.pubkey && <TrustBadge pubkey={video.pubkey} />}
              </div>
              <div className="text-sm text-muted-foreground">
                {video &&
                  formatDistance(new Date(getPublishDate(video) * 1000), new Date(), {
                    addSuffix: true,
                    locale: dateLocale,
                  })}
                {video?.published_at && video.created_at !== video.published_at && (
                  <span className="ml-1">
                    (
                    {t('video.updatedAgo', {
                      time: formatDistance(new Date(video.created_at * 1000), new Date(), {
                        locale: dateLocale,
                      }),
                    })}
                    )
                  </span>
                )}
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-2 mt-4 md:mt-0 w-full md:w-auto">
            <VideoReactionButtons
              eventId={video.id}
              authorPubkey={video.pubkey}
              kind={video.kind}
              relays={relaysToUse}
              layout="inline"
              currentTime={currentTime}
              identifier={video.identifier}
            />
            {userPubkey && !isMobile && (
              <AddToPlaylistButton
                videoId={video.id}
                videoKind={video.kind}
                videoTitle={video.title}
                videoPubkey={video.pubkey}
                videoIdentifier={video.identifier}
              />
            )}
            <ShareButton
              shareOpen={shareOpen}
              setShareOpen={setShareOpen}
              shareUrl={shareUrl}
              includeTimestamp={includeTimestamp}
              setIncludeTimestamp={setIncludeTimestamp}
              shareLinks={shareLinks}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" aria-label="More actions">
                  <MoreVertical className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                {isMobile && userPubkey && (
                  <AddToPlaylistButton
                    videoId={video.id}
                    videoKind={video.kind}
                    videoTitle={video.title}
                    asMenuItem
                  />
                )}
                {userPubkey && (
                  <DropdownMenuItem onSelect={handleToggleProfilePin} disabled={isPinning}>
                    {isVideoPinned ? <PinOff className="w-5 h-5" /> : <Pin className="w-5 h-5" />}
                    &nbsp;{' '}
                    {isVideoPinned
                      ? t('video.unpinFromProfile')
                      : t('video.pinToProfile')}
                  </DropdownMenuItem>
                )}
                {isEditable && videoEvent && (
                  <DropdownMenuItem onSelect={() => setShowEditDialog(true)}>
                    <Pencil className="w-5 h-5" />
                    &nbsp; {t('editVideo.button')}
                  </DropdownMenuItem>
                )}
                {videoEvent && isBetaUser(userPubkey) && !isEditable && (
                  <DropdownMenuItem onSelect={() => setShowLabelDialog(true)}>
                    <Tag className="w-5 h-5" />
                    &nbsp; {t('labelVideo.button')}
                  </DropdownMenuItem>
                )}
                {onMirror && userPubkey && (
                  <DropdownMenuItem onSelect={onMirror}>
                    <Copy className="w-5 h-5" />
                    &nbsp; {t('video.mirrorVideo')}
                  </DropdownMenuItem>
                )}
                {userPubkey && onContribute && (
                  <DropdownMenuItem onSelect={onContribute}>
                    <Zap className="w-5 h-5" />
                    &nbsp; {t('video.contribute.menuItem')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setShowDebugDialog(true)}>
                  <Bug className="w-5 h-5" />
                  &nbsp; {t('errors.debugInfo')}
                </DropdownMenuItem>
                {userPubkey && (
                  <DropdownMenuItem onSelect={() => setShowReportDialog(true)}>
                    <Flag className="w-5 h-5" />
                    &nbsp; {t('video.reportVideo')}
                  </DropdownMenuItem>
                )}
                {userPubkey === video.pubkey && (
                  <DropdownMenuItem onSelect={() => setShowDeleteDialog(true)}>
                    <TrashIcon className="w-5 h-5" />
                    &nbsp; {t('video.deleteVideo')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {video?.description ? (
          <CollapsibleText
            text={video.description}
            className="bg-muted p-4 rounded-lg text-muted-foreground"
            videoLink={video.link}
          />
        ) : (
          <Separator />
        )}

        {/* Display tags, languages, location, and origins */}
        {(video && video.tags.length > 0) ||
        (video &&
          'languages' in video &&
          Array.isArray(video.languages) &&
          video.languages.length > 0) ||
        (video && video.origins && video.origins.length > 0) ||
        geohash ? (
          <div className="flex flex-wrap items-center gap-2 pb-1">
            {/* Language badges with flag + shortcode */}
            {video &&
              'languages' in video &&
              Array.isArray(video.languages) &&
              (video.languages as string[]).map((lang: string) => {
                const { flag, code } = getLanguageDisplay(lang)
                return (
                  <Badge
                    key={`lang-${lang}`}
                    variant="outline"
                    className="shrink-0 whitespace-nowrap"
                  >
                    {flag} {code}
                  </Badge>
                )
              })}
            {/* Tag badges */}
            {video &&
              video.tags.slice(0, 20).map(tag => (
                <Link key={tag} to={`/tag/${tag.toLowerCase()}`}>
                  <Badge
                    variant="secondary"
                    className="shrink-0 whitespace-nowrap cursor-pointer hover:bg-secondary/80"
                  >
                    #{tag}
                  </Badge>
                </Link>
              ))}
            {/* Origin badges */}
            {video &&
              video.origins &&
              video.origins.map((origin, index) => (
                <a
                  key={`origin-${index}`}
                  href={origin.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={origin.platform}
                  className="inline-flex"
                >
                  <Badge
                    variant="secondary"
                    className="shrink-0 whitespace-nowrap cursor-pointer flex items-center gap-1 hover:bg-secondary/80"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {origin.platform.charAt(0).toUpperCase() + origin.platform.slice(1)}
                  </Badge>
                </a>
              ))}
            {geohash && (
              <a
                href={(() => {
                  try {
                    const decoded = ngeohash.decode(geohash)
                    return `https://www.openstreetmap.org/?mlat=${decoded.latitude}&mlon=${decoded.longitude}&zoom=15`
                  } catch {
                    return '#'
                  }
                })()}
                target="_blank"
                rel="noopener noreferrer"
                title={t('video.viewLocation')}
              >
                <Badge
                  variant="secondary"
                  className="shrink-0 cursor-pointer hover:bg-secondary/80 inline-flex items-center"
                >
                  <MapPin className="w-3.5 h-3.5 mr-1" />
                  {t('video.location')}
                </Badge>
              </a>
            )}
          </div>
        ) : null}
      </div>
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('video.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('video.deleteConfirmMessage')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? t('common.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {videoEvent && (
        <VideoDebugInfo
          open={showDebugDialog}
          onOpenChange={setShowDebugDialog}
          videoEvent={videoEvent}
          video={video}
          blossomServers={configBlossomServers}
          contributedVariantDebugRecords={contributedVariantDebugRecords}
          userServers={userServers}
        />
      )}
      {videoEvent && (
        <LabelVideoDialog
          videoEvent={videoEvent}
          open={showLabelDialog}
          onOpenChange={setShowLabelDialog}
        />
      )}
      {videoEvent && isEditable && (
        <EditVideoDialog
          videoEvent={videoEvent}
          relays={relaysToUse}
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
        />
      )}
      {video && (
        <ReportDialog
          open={showReportDialog}
          onOpenChange={setShowReportDialog}
          reportType="video"
          contentId={video.id}
          contentAuthor={video.pubkey}
        />
      )}
      {video && (
        <div className="pt-4 px-2 md:px-0">
          <VideoComments
            videoId={video.id}
            authorPubkey={video.pubkey}
            link={video.link}
            relays={relaysToUse}
            videoKind={video.kind}
            identifier={video.identifier}
          />
        </div>
      )}
    </>
  )
})
