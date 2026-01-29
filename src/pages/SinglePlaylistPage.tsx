import { useEffect, useState, useMemo, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Trash2, AlertCircle, Loader2 } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { VideoGrid } from '@/components/VideoGrid'
import { VideoCard } from '@/components/VideoCard'
import { UserAvatar } from '@/components/UserAvatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import { buildProfileUrlFromPubkey } from '@/lib/nprofile'
import { usePlaylistDetails, useProfile, useCurrentUser, usePlaylists } from '@/hooks'
import type { VideoEvent } from '@/utils/video-event'

interface SortableVideoCardProps {
  video: VideoEvent
  playlistParam: string
  onRemove: (videoId: string) => void
  isRemoving: boolean
}

function SortableVideoCard({ video, playlistParam, onRemove, isRemoving }: SortableVideoCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: video.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {/* Drag handle */}
      <button
        type="button"
        className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded bg-black/60 hover:bg-black/80 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 text-white" />
      </button>

      {/* Delete button */}
      <button
        type="button"
        onClick={() => onRemove(video.id)}
        disabled={isRemoving}
        className="absolute right-2 top-2 z-10 p-1.5 rounded bg-black/60 hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
      >
        {isRemoving ? (
          <Loader2 className="h-4 w-4 text-white animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4 text-white" />
        )}
      </button>

      <VideoCard video={video} format="horizontal" playlistParam={playlistParam} />
    </div>
  )
}

export default function SinglePlaylistPage() {
  const { t } = useTranslation()
  const { nip19: nip19param } = useParams<{ nip19: string }>()
  const { user } = useCurrentUser()
  const { updatePlaylist, removeVideo } = usePlaylists()

  const {
    playlistEvent,
    playlistTitle,
    playlistDescription,
    videoEvents,
    videoRefs,
    readRelays,
    isLoadingPlaylist,
    isLoadingVideos,
    failedVideoIds,
    loadingVideoIds,
  } = usePlaylistDetails(nip19param)

  const [isEditMode, setIsEditMode] = useState(false)
  const [orderedVideoIds, setOrderedVideoIds] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [removingVideoId, setRemovingVideoId] = useState<string | null>(null)
  const [videoToRemove, setVideoToRemove] = useState<string | null>(null)

  const metadata = useProfile(playlistEvent?.pubkey ? { pubkey: playlistEvent.pubkey } : undefined)
  const name =
    metadata?.display_name || metadata?.name || playlistEvent?.pubkey?.slice(0, 8) || 'Unknown'

  // Check if current user is the playlist owner
  const isOwner = user?.pubkey && playlistEvent?.pubkey === user.pubkey

  // Get playlist identifier from event
  const playlistIdentifier = useMemo(() => {
    if (!playlistEvent) return null
    return playlistEvent.tags.find(t => t[0] === 'd')?.[1] || null
  }, [playlistEvent])

  // Initialize ordered video IDs from videoRefs
  useEffect(() => {
    if (videoRefs.length > 0 && orderedVideoIds.length === 0) {
      setOrderedVideoIds(videoRefs.map(ref => ref.id))
    }
  }, [videoRefs, orderedVideoIds.length])

  // Create a map from videoEvents for quick lookup
  const videoEventMap = useMemo(() => {
    const map = new Map<string, VideoEvent>()
    videoEvents.forEach(video => map.set(video.id, video))
    return map
  }, [videoEvents])

  // Get ordered video events based on orderedVideoIds
  const orderedVideoEvents = useMemo(() => {
    return orderedVideoIds
      .map(id => videoEventMap.get(id))
      .filter((v): v is VideoEvent => v !== undefined)
  }, [orderedVideoIds, videoEventMap])

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event

      if (over && active.id !== over.id) {
        const oldIndex = orderedVideoIds.indexOf(active.id as string)
        const newIndex = orderedVideoIds.indexOf(over.id as string)

        const newOrder = arrayMove(orderedVideoIds, oldIndex, newIndex)
        setOrderedVideoIds(newOrder)

        // Auto-save the new order
        if (playlistIdentifier && playlistEvent) {
          setIsSaving(true)
          try {
            const titleTag = playlistEvent.tags.find(t => t[0] === 'title')
            const descTag = playlistEvent.tags.find(t => t[0] === 'description')

            await updatePlaylist({
              eventId: playlistEvent.id,
              identifier: playlistIdentifier,
              name: titleTag?.[1] || 'Untitled Playlist',
              description: descTag?.[1],
              videos: newOrder.map(id => {
                const ref = videoRefs.find(r => r.id === id)
                return {
                  id,
                  kind: 0,
                  added_at: playlistEvent.created_at,
                  relayHint: ref?.relayHints?.[0],
                }
              }),
            })
          } catch (err) {
            console.error('Failed to save playlist order:', err)
            // Revert on error
            setOrderedVideoIds(videoRefs.map(ref => ref.id))
          } finally {
            setIsSaving(false)
          }
        }
      }
    },
    [orderedVideoIds, playlistIdentifier, playlistEvent, videoRefs, updatePlaylist]
  )

  const handleRemoveVideo = useCallback(
    async (videoId: string) => {
      if (!playlistIdentifier) return

      setRemovingVideoId(videoId)
      try {
        await removeVideo(playlistIdentifier, videoId)
        setOrderedVideoIds(prev => prev.filter(id => id !== videoId))
      } catch (err) {
        console.error('Failed to remove video:', err)
      } finally {
        setRemovingVideoId(null)
        setVideoToRemove(null)
      }
    },
    [playlistIdentifier, removeVideo]
  )

  useEffect(() => {
    if (playlistTitle) {
      document.title = `${playlistTitle} - nostube`
    } else {
      document.title = 'nostube'
    }
    return () => {
      document.title = 'nostube'
    }
  }, [playlistTitle])

  if (isLoadingPlaylist) {
    return (
      <div className="max-w-560 mx-auto p-8 flex flex-col gap-8">
        <Skeleton className="h-8 w-64 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (!playlistEvent) {
    return (
      <div className="max-w-560 mx-auto p-8">
        <div className="text-center py-12 text-muted-foreground">
          Playlist not found or failed to load
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-560 mx-auto p-8 flex flex-col gap-8">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{playlistTitle}</h1>
          {playlistDescription && (
            <p className="text-muted-foreground mt-2">{playlistDescription}</p>
          )}
        </div>

        <div className="shrink-0 flex flex-row gap-2 items-center">
          {isOwner && (
            <Button
              variant={isEditMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIsEditMode(!isEditMode)}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Pencil className="h-4 w-4 mr-2" />
              )}
              {isEditMode ? t('common.done') : t('common.edit')}
            </Button>
          )}

          <Link
            to={buildProfileUrlFromPubkey(playlistEvent.pubkey, readRelays)}
            className="flex flex-row gap-2 items-center"
          >
            <UserAvatar
              picture={metadata?.picture}
              pubkey={playlistEvent.pubkey}
              name={name}
              className="h-10 w-10"
            />
            {name}
          </Link>
        </div>
      </div>

      {isEditMode ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedVideoIds} strategy={verticalListSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {orderedVideoEvents.map(video => (
                <SortableVideoCard
                  key={video.id}
                  video={video}
                  playlistParam={nip19param || ''}
                  onRemove={setVideoToRemove}
                  isRemoving={removingVideoId === video.id}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <VideoGrid
          videos={orderedVideoEvents.length > 0 ? orderedVideoEvents : videoEvents}
          isLoading={isLoadingVideos || loadingVideoIds.size > 0}
          playlistParam={nip19param}
        />
      )}

      {failedVideoIds.size > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t('playlists.failedVideos', { count: failedVideoIds.size })}
          </AlertDescription>
        </Alert>
      )}

      {/* Remove video confirmation dialog */}
      <AlertDialog open={!!videoToRemove} onOpenChange={() => setVideoToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('playlists.removeVideo.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('playlists.removeVideo.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => videoToRemove && handleRemoveVideo(videoToRemove)}
              disabled={!!removingVideoId}
            >
              {removingVideoId ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t('playlists.removeVideo.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
