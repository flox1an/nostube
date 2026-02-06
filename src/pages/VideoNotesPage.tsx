import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVideoNotes, type VideoNote } from '@/hooks/useVideoNotes'
import { useUploadDrafts } from '@/hooks/useUploadDrafts'
import { useAppContext } from '@/hooks'
import { useToast } from '@/hooks/useToast'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow'
import { getDateLocale } from '@/lib/date-locale'
import { imageProxyVideoPreview, imageProxyVideoThumbnail } from '@/lib/utils'
import { formatDuration } from '@/lib/formatDuration'
import { formatFileSize } from '@/lib/blossom-utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Play, Import, CheckCircle2, Loader2, X, ImageOff, Clock, HardDrive } from 'lucide-react'

const PAGE_SIZE = 20

function VideoNoteCard({
  note,
  onImport,
}: {
  note: VideoNote
  onImport: (note: VideoNote) => void
}) {
  const { t, i18n } = useTranslation()
  const { config } = useAppContext()
  const [isPlaying, setIsPlaying] = useState(false)
  const [thumbnailError, setThumbnailError] = useState(false)
  const [proxyThumbnailError, setProxyThumbnailError] = useState(false)
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

  // Build optimized thumbnail URL with fallback chain
  const thumbnailSrc = useMemo(() => {
    if (thumbnailError && proxyThumbnailError) return undefined

    // If the proxy thumbnail (image) failed, try proxy from video URL
    if (thumbnailError && note.videoUrls[0]) {
      return imageProxyVideoThumbnail(note.videoUrls[0], config.thumbResizeServerUrl)
    }

    // Primary: proxy the thumbnail URL through imgproxy for optimized WebP
    if (note.thumbnailUrl) {
      // If thumbnailUrl is a video URL (same as first video), use video thumbnail proxy
      const isVideoUrl = note.videoUrls.includes(note.thumbnailUrl)
      if (isVideoUrl) {
        return imageProxyVideoThumbnail(note.thumbnailUrl, config.thumbResizeServerUrl)
      }
      return imageProxyVideoPreview(note.thumbnailUrl, config.thumbResizeServerUrl)
    }

    // Fallback: generate thumbnail from first video URL
    if (note.videoUrls[0]) {
      return imageProxyVideoThumbnail(note.videoUrls[0], config.thumbResizeServerUrl)
    }

    return undefined
  }, [
    note.thumbnailUrl,
    note.videoUrls,
    thumbnailError,
    proxyThumbnailError,
    config.thumbResizeServerUrl,
  ])

  const handleImport = () => onImport(note)

  const handleStopPlaying = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setIsPlaying(false)
    },
    [setIsPlaying]
  )

  // Truncate content for preview
  const contentPreview =
    note.content.length > 200 ? note.content.substring(0, 200) + '...' : note.content

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
                {thumbnailSrc && !proxyThumbnailError ? (
                  <img
                    src={thumbnailSrc}
                    alt="Video thumbnail"
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={() => {
                      if (!thumbnailError) {
                        setThumbnailError(true)
                      } else {
                        setProxyThumbnailError(true)
                      }
                    }}
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
                {note.isReposted && (
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
              <p className="text-sm text-muted-foreground line-clamp-3">{contentPreview}</p>
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
                {!note.isReposted && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleImport}
                    className="cursor-pointer"
                  >
                    <Import className="h-4 w-4 mr-1" />
                    {t('pages.videoNotes.import')}
                  </Button>
                )}
                {note.isReposted && (
                  <Button size="sm" variant="outline" disabled>
                    {t('pages.videoNotes.alreadyImported')}
                  </Button>
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

  useEffect(() => {
    document.title = `${t('pages.videoNotes.title')} - nostube`
    return () => {
      document.title = 'nostube'
    }
  }, [t])

  const handleImport = useCallback(
    (note: VideoNote) => {
      try {
        const draft = createDraft()

        // Remove all video URLs from the content to use as description
        let description = note.content
        note.videoUrls.forEach(videoUrl => {
          description = description.replace(videoUrl, '')
        })
        description = description.replace(/\s+/g, ' ').trim()

        // Fill the draft with video URL, description, and publish date
        updateDraft(draft.id, {
          inputMethod: 'url',
          videoUrl: note.videoUrls[0],
          description,
          publishAt: note.created_at,
        })

        navigate(`/upload?draft=${draft.id}&step=2`)
      } catch {
        toast({
          title: t('upload.draft.maxDraftsReached'),
          variant: 'destructive',
          duration: 5000,
        })
      }
    },
    [createDraft, updateDraft, navigate, toast, t]
  )

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
            <VideoNoteCard key={note.id} note={note} onImport={handleImport} />
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
  )
}
