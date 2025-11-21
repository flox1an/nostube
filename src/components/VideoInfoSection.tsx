import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { nip19, type NostrEvent } from 'nostr-tools'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { formatDistance } from 'date-fns'
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
import { MoreVertical, TrashIcon, Bug, Copy } from 'lucide-react'
import { imageProxy, nowInSecs } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { AddToPlaylistButton } from '@/components/AddToPlaylistButton'
import { VideoReactionButtons } from '@/components/VideoReactionButtons'
import ShareButton from '@/components/ShareButton'
import { VideoComments } from '@/components/VideoComments'
import { VideoDebugInfo } from '@/components/VideoDebugInfo'
import { type VideoEvent } from '../utils/video-event'
import type { ServerInfo, ServerAvailability } from '@/hooks/useVideoServerAvailability'
import { useTranslation } from 'react-i18next'
import { getDateLocale } from '@/lib/date-locale'

interface VideoInfoSectionProps {
  video: VideoEvent | null
  isLoading: boolean
  metadata: any
  authorName: string
  relaysToUse: string[]
  userPubkey: string | undefined
  configRelays: { url: string }[]
  configBlossomServers: any[]
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
  serverList: ServerInfo[]
  serverAvailability: Map<string, ServerAvailability>
  onCheckAvailability: () => Promise<void>
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
  serverList,
  serverAvailability,
  onCheckAvailability,
}: VideoInfoSectionProps) {
  const { t, i18n } = useTranslation()
  const { publish, isPending: isDeleting } = useNostrPublish()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDebugDialog, setShowDebugDialog] = useState(false)

  // Map i18n language codes to date-fns locales
  const dateLocale = getDateLocale(i18n.language)

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
      <div className="flex flex-col gap-4 p-2 sm:px-0">
        {video?.title && <h1 className="text-2xl font-bold">{video?.title}</h1>}

        <div className="flex flex-col md:flex-row items-start justify-between">
          <Link
            to={`/author/${nip19.nprofileEncode({ pubkey: video?.pubkey || '', relays: relaysToUse })}`}
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
                    locale: dateLocale,
                  })}
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-2 mt-4 md:mt-0 w-full md:w-auto">
            {userPubkey && (
              <>
                <VideoReactionButtons
                  eventId={video.id}
                  authorPubkey={video.pubkey}
                  kind={video.kind}
                  relays={relaysToUse}
                  layout="inline"
                />
                <AddToPlaylistButton
                  videoId={video.id}
                  videoKind={video.kind}
                  videoTitle={video.title}
                />
              </>
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
                {onMirror && (
                  <DropdownMenuItem onSelect={onMirror}>
                    <Copy className="w-5 h-5" />
                    &nbsp; {t('video.mirrorVideo')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setShowDebugDialog(true)}>
                  <Bug className="w-5 h-5" />
                  &nbsp; Debug Info
                </DropdownMenuItem>
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

        {video && video.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {video.tags.slice(0, 20).map(tag => (
              <Link key={tag} to={`/tag/${tag.toLowerCase()}`}>
                <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                  #{tag}
                </Badge>
              </Link>
            ))}
          </div>
        )}
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
      <VideoDebugInfo
        open={showDebugDialog}
        onOpenChange={setShowDebugDialog}
        videoEvent={videoEvent}
        video={video}
        blossomServers={configBlossomServers}
        serverList={serverList}
        serverAvailability={serverAvailability}
        onCheckAvailability={onCheckAvailability}
      />
      {video && (
        <div className="py-4">
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
