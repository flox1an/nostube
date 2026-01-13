import React, { useState } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { Link } from 'react-router-dom'
import { nip19, type NostrEvent } from 'nostr-tools'
import { UserAvatar } from '@/components/UserAvatar'
import { Badge } from '@/components/ui/badge'
import { formatDistance } from 'date-fns/formatDistance'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { CollapsibleText } from '@/components/ui/collapsible-text'
import { useNostrPublish } from '@/hooks'
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
import { MoreVertical, TrashIcon, Bug, Copy, MapPin, Tag, Flag, Clock } from 'lucide-react'
import { nowInSecs } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { AddToPlaylistButton } from '@/components/AddToPlaylistButton'
import { VideoReactionButtons } from '@/components/VideoReactionButtons'
import ShareButton from '@/components/ShareButton'
import { VideoComments } from '@/components/VideoComments'
import { VideoDebugInfo } from '@/components/VideoDebugInfo'
import { LabelVideoDialog } from '@/components/LabelVideoDialog'
import { ReportDialog } from '@/components/ReportDialog'
import { type VideoEvent } from '../utils/video-event'
import { type BlossomServer } from '@/contexts/AppContext'
import { useTranslation } from 'react-i18next'
import { getDateLocale } from '@/lib/date-locale'
import { isBetaUser } from '@/lib/beta-users'
import ngeohash from 'ngeohash'

// Map ISO-639-1 language codes to country codes for flag display
const languageToCountryCode: Record<string, string> = {
  en: 'US',
  de: 'DE',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
  pt: 'BR',
  ru: 'RU',
  zh: 'CN',
  ja: 'JP',
  ko: 'KR',
  ar: 'SA',
  hi: 'IN',
  nl: 'NL',
  pl: 'PL',
  tr: 'TR',
  uk: 'UA',
  vi: 'VN',
  th: 'TH',
  sv: 'SE',
  da: 'DK',
  fi: 'FI',
  no: 'NO',
  cs: 'CZ',
  el: 'GR',
  he: 'IL',
  id: 'ID',
  ms: 'MY',
  ro: 'RO',
  hu: 'HU',
  sk: 'SK',
  bg: 'BG',
  hr: 'HR',
  sr: 'RS',
  sl: 'SI',
  et: 'EE',
  lv: 'LV',
  lt: 'LT',
  fa: 'IR',
  bn: 'BD',
  ta: 'IN',
  te: 'IN',
}

// Convert country code to flag emoji
function countryCodeToFlag(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}

// Get flag + shortcode for a language
function getLanguageDisplay(langCode: string): { flag: string; code: string } {
  const upperCode = langCode.toUpperCase()
  const countryCode = languageToCountryCode[langCode.toLowerCase()]
  const flag = countryCode ? countryCodeToFlag(countryCode) : '🌐'
  return { flag, code: upperCode }
}

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
  userServers?: string[]
  geohash?: string | null
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
  userServers,
  geohash,
}: VideoInfoSectionProps) {
  const { t, i18n } = useTranslation()
  const { publish, isPending: isDeleting } = useNostrPublish()
  const isMobile = useIsMobile()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDebugDialog, setShowDebugDialog] = useState(false)
  const [showLabelDialog, setShowLabelDialog] = useState(false)
  const [showReportDialog, setShowReportDialog] = useState(false)

  // Map i18n language codes to date-fns locales
  const dateLocale = getDateLocale(i18n.language)

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

  if (!video || video.urls.length === 0) return null

  const handleDelete = async () => {
    if (!video) return
    await publish({
      event: {
        kind: 5,
        content: t('video.deletedByAuthor'),
        tags: [['e', video.id]],
        created_at: nowInSecs(),
      },
      relays: configRelays.map(r => r.url),
    })
    setShowDeleteDialog(false)
    if (onDelete) {
      onDelete()
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 px-2 md:px-0">
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
            to={`/author/${nip19.nprofileEncode({ pubkey: video?.pubkey || '', relays: relaysToUse })}`}
            className="flex items-center gap-4"
          >
            <UserAvatar picture={metadata?.picture} pubkey={video?.pubkey} name={authorName} />
            <div>
              <div className="font-semibold">{authorName}</div>
              <div className="text-sm text-muted-foreground">
                {video?.created_at &&
                  formatDistance(new Date(video.created_at * 1000), new Date(), {
                    addSuffix: true,
                    locale: dateLocale,
                  })}
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
            />
            {userPubkey && !isMobile && (
              <AddToPlaylistButton
                videoId={video.id}
                videoKind={video.kind}
                videoTitle={video.title}
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
                {videoEvent && isBetaUser(userPubkey) && (
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
                <DropdownMenuItem onSelect={() => setShowDebugDialog(true)}>
                  <Bug className="w-5 h-5" />
                  &nbsp; Debug Info
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

        {/* Display tags, languages, and location */}
        {(video && video.tags.length > 0) ||
        (video &&
          'languages' in video &&
          Array.isArray(video.languages) &&
          video.languages.length > 0) ||
        geohash ? (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {/* Language badges with flag + shortcode */}
            {video &&
              'languages' in video &&
              Array.isArray(video.languages) &&
              (video.languages as string[]).map((lang: string) => {
                const { flag, code } = getLanguageDisplay(lang)
                return (
                  <Badge key={`lang-${lang}`} variant="outline" className="shrink-0">
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
                    className="shrink-0 cursor-pointer hover:bg-secondary/80"
                  >
                    #{tag}
                  </Badge>
                </Link>
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
          />
        </div>
      )}
    </>
  )
})
