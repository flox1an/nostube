import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVideoNotes, type VideoNote } from '@/hooks/useVideoNotes'
import { useUploadDrafts } from '@/hooks/useUploadDrafts'
import type { TaggedPerson } from '@/types/upload-draft'
import { useToast } from '@/hooks/useToast'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow'
import { getDateLocale } from '@/lib/date-locale'
import { useImageCascade } from '@/hooks/useImageCascade'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { formatDuration } from '@/lib/formatDuration'
import { formatFileSize } from '@/lib/blossom-utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Play,
  Import,
  Send,
  CheckCircle2,
  Loader2,
  X,
  ImageOff,
  Clock,
  HardDrive,
} from 'lucide-react'
import { RichTextContent } from '@/components/RichTextContent'
import { PublishNoteDialog } from '@/components/PublishNoteDialog'

const PAGE_SIZE = 20

function VideoNoteCard({
  note,
  onPublish,
  onFullImport,
  isPublished,
}: {
  note: VideoNote
  onPublish: (note: VideoNote) => void
  onFullImport: (note: VideoNote) => void
  isPublished?: boolean
}) {
  const { t, i18n } = useTranslation()
  const { user } = useCurrentUser()
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState<number | undefined>(undefined)
  const [sizeBytes, setSizeBytes] = useState<number | undefined>(note.sizeBytes)
  const metadataProbed = useRef(false)
  const dateLocale = getDateLocale(i18n.language)

  // Probe video metadata (duration + size via HEAD) on mount
  useEffect(() => {
    if (metadataProbed.current || !note.videoUrls[0]) return
    metadataProbed.current = true

    const url = note.videoUrls[0]

    // Probe duration via a hidden video element with preload="metadata"
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.crossOrigin = 'anonymous'
    video.src = url

    const handleMetadata = () => {
      if (video.duration && isFinite(video.duration)) {
        setDuration(Math.round(video.duration))
      }
      cleanup()
    }
    const handleError = () => cleanup()
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', handleMetadata)
      video.removeEventListener('error', handleError)
      video.src = ''
      video.load()
    }

    video.addEventListener('loadedmetadata', handleMetadata)
    video.addEventListener('error', handleError)

    // If no size from imeta, try HEAD request for Content-Length
    if (!note.sizeBytes) {
      fetch(url, { method: 'HEAD' })
        .then(res => {
          const cl = res.headers.get('content-length')
          if (cl) {
            const bytes = parseInt(cl, 10)
            if (!isNaN(bytes) && bytes > 0) setSizeBytes(bytes)
          }
        })
        .catch(() => {
          // Ignore - size will just not be shown
        })
    }

    return () => cleanup()
  }, [note.videoUrls, note.sizeBytes])

  // If `thumbnailUrl` is the video URL itself (a generated frame), there's no separate
  // raw image to fall back to — pass undefined as src and the video URL as the cascade's
  // video-frame source. Otherwise prefer the thumbnail image with the video URL as last
  // resort.
  const thumbnailIsSameAsVideo = note.thumbnailUrl && note.videoUrls.includes(note.thumbnailUrl)
  const cascade = useImageCascade({
    src: thumbnailIsSameAsVideo ? undefined : note.thumbnailUrl,
    videoUrl: note.videoUrls[0],
    variant: 'preview',
    authorPubkey: user?.pubkey,
  })

  const handlePublish = () => onPublish(note)
  const handleFullImport = () => onFullImport(note)

  const handleStopPlaying = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setIsPlaying(false)
    },
    [setIsPlaying]
  )

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Thumbnail / Inline Video */}
          <div className="relative shrink-0 w-40 h-24 bg-muted rounded overflow-hidden">
            {isPlaying ? (
              <>
                <video
                  controls
                  autoPlay
                  className="w-full h-full object-contain bg-black"
                  crossOrigin="anonymous"
                >
                  {note.videoUrls.map((url, idx) => (
                    <source key={idx} src={url} />
                  ))}
                </video>
                <Button
                  variant="secondary"
                  size="sm"
                  className="absolute top-1 right-1 rounded-full h-6 w-6 p-0 opacity-80 hover:opacity-100"
                  onClick={handleStopPlaying}
                >
                  <X className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <>
                {cascade.src ? (
                  <img
                    src={cascade.src}
                    alt="Video thumbnail"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    onError={cascade.onError}
                    onLoad={cascade.onLoad}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageOff className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="rounded-full h-10 w-10 p-0"
                    onClick={() => setIsPlaying(true)}
                  >
                    <Play className="h-5 w-5" />
                  </Button>
                </div>
                {duration !== undefined && duration > 0 && (
                  <div className="absolute bottom-1 left-1 bg-black/70 text-white px-1 rounded text-[10px] font-mono">
                    {formatDuration(duration)}
                  </div>
                )}
                {(note.isReposted || isPublished) && (
                  <div className="absolute top-2 right-2">
                    <Badge variant="default" className="bg-green-500 text-white">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {t('pages.videoNotes.imported')}
                    </Badge>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="space-y-2">
              <RichTextContent
                content={note.content}
                className="text-sm text-muted-foreground line-clamp-3"
                authorPubkey={user?.pubkey}
              />
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(note.created_at * 1000), {
                    addSuffix: true,
                    locale: dateLocale,
                  })}
                </span>
                {duration !== undefined && duration > 0 && (
                  <Badge variant="outline" className="gap-1 text-xs font-mono">
                    <Clock className="h-3 w-3" />
                    {formatDuration(duration)}
                  </Badge>
                )}
                {sizeBytes !== undefined && sizeBytes > 0 && (
                  <Badge variant="outline" className="gap-1 text-xs font-mono">
                    <HardDrive className="h-3 w-3" />
                    {formatFileSize(sizeBytes)}
                  </Badge>
                )}
                {note.videoUrls.length > 1 && (
                  <Badge variant="outline">
                    {t('pages.videoNotes.multipleVideos', { count: note.videoUrls.length })}
                  </Badge>
                )}
                {note.blossomHashes.length > 0 && (
                  <Badge variant="outline">
                    {t('pages.videoNotes.blossomUrl', { count: note.blossomHashes.length })}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                {note.isReposted || isPublished ? (
                  <Button size="sm" variant="outline" disabled>
                    {t('pages.videoNotes.alreadyImported')}
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={handlePublish}
                      className="cursor-pointer"
                    >
                      <Send className="h-4 w-4 mr-1" />
                      Publish
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleFullImport}
                      className="cursor-pointer"
                    >
                      <Import className="h-4 w-4 mr-1" />
                      {t('pages.videoNotes.import')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function VideoNotesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { notes, loading } = useVideoNotes()
  const { createDraft, updateDraft } = useUploadDrafts()
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [selectedNote, setSelectedNote] = useState<VideoNote | null>(null)
  const [publishedIds, setPublishedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    document.title = `${t('pages.videoNotes.title')} - nostube`
    return () => {
      document.title = 'nostube'
    }
  }, [t])

  // Quick publish: open the preview/publish dialog
  const handlePublish = useCallback((note: VideoNote) => {
    setSelectedNote(note)
  }, [])

  // Full import: create upload draft and navigate to the details screen
  const handleFullImport = useCallback(
    (note: VideoNote) => {
      try {
        const draft = createDraft()
        let description = note.content
        note.videoUrls.forEach(url => {
          description = description.replace(url, '')
        })
        description = description.replace(/\s+/g, ' ').trim()
        const people: TaggedPerson[] = note.pubkeys.map(({ pubkey, relays }) => ({
          pubkey,
          name: '',
          relays: relays.length > 0 ? relays : undefined,
        }))
        updateDraft(draft.id, {
          inputMethod: 'url',
          videoUrl: note.videoUrls[0],
          description,
          publishAt: note.created_at,
          ...(people.length > 0 && { people }),
        })
        navigate(`/upload?draft=${draft.id}&screen=details`)
      } catch {
        toast({ title: t('upload.draft.maxDraftsReached'), variant: 'destructive', duration: 5000 })
      }
    },
    [createDraft, updateDraft, navigate, toast, t]
  )

  const handlePublished = useCallback((noteId: string) => {
    setPublishedIds(prev => new Set(prev).add(noteId))
  }, [])

  const visibleNotes = useMemo(() => notes.slice(0, visibleCount), [notes, visibleCount])
  const hasMore = visibleCount < notes.length
  const remaining = notes.length - visibleCount

  if (loading) {
    return (
      <div className="container mx-auto py-6 max-w-4xl px-4">
        <h1 className="text-3xl font-bold mb-6">{t('pages.videoNotes.title')}</h1>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="container mx-auto py-6 max-w-4xl px-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">{t('pages.videoNotes.title')}</h1>
          <p className="text-muted-foreground">{t('pages.videoNotes.description')}</p>
        </div>

        {notes.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">{t('pages.videoNotes.empty')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {visibleNotes.map(note => (
              <VideoNoteCard
                key={note.id}
                note={note}
                onPublish={handlePublish}
                onFullImport={handleFullImport}
                isPublished={publishedIds.has(note.id)}
              />
            ))}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
                  className="cursor-pointer"
                >
                  Load more ({remaining})
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <PublishNoteDialog
        note={selectedNote}
        onOpenChange={open => !open && setSelectedNote(null)}
        onPublished={handlePublished}
      />
    </>
  )
}
