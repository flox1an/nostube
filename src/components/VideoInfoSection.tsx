import { Link } from 'react-router-dom'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { formatDistance } from 'date-fns'
import { Separator } from '@/components/ui/separator'
import { useState } from 'react'
import { nip19, NostrEvent } from 'nostr-tools'
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
import { MoreVertical, TrashIcon, Bug } from 'lucide-react'
import { imageProxy, nowInSecs } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { AddToPlaylistButton } from '@/components/AddToPlaylistButton'
import { ButtonWithReactions } from '@/components/ButtonWithReactions'
import ShareButton from '@/components/ShareButton'
import { VideoComments } from '@/components/VideoComments'
import { VideoDebugInfo } from '@/components/VideoDebugInfo'
import type { ProcessedVideoEvent } from '@/utils/video-event'

interface VideoInfoSectionProps {
  video: ProcessedVideoEvent | null
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
}

export function VideoInfoSection({
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
}: VideoInfoSectionProps) {
  const { publish, isPending: isDeleting } = useNostrPublish()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDebugDialog, setShowDebugDialog] = useState(false)

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
        content: 'Deleted by author',
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

        <div className="flex items-start justify-between">
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
              relays={relaysToUse}
            />
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
                <DropdownMenuItem onSelect={() => setShowDebugDialog(true)}>
                  <Bug className="w-5 h-5" />
                  &nbsp; Debug Info
                </DropdownMenuItem>
                {userPubkey === video.pubkey && (
                  <DropdownMenuItem onSelect={() => setShowDeleteDialog(true)}>
                    <TrashIcon className="w-5 h-5" />
                    &nbsp; Delete Video
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
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Video?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this video? This action cannot be undone. A deletion
              event will be published to all relays.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
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
}
