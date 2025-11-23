import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVideoNotes, type VideoNote } from '@/hooks/useVideoNotes'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import { getDateLocale } from '@/lib/date-locale'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Play, Upload, CheckCircle2 } from 'lucide-react'
import { VideoCardSkeleton } from '@/components/VideoCard'

function VideoNoteCard({ note }: { note: VideoNote }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const dateLocale = getDateLocale(i18n.language)

  const handleRepost = () => {
    // Navigate to upload page with URL prefilled
    const url = note.videoUrls[0]
    navigate(`/upload?url=${encodeURIComponent(url)}`)
  }

  // Truncate content for preview
  const contentPreview =
    note.content.length > 200 ? note.content.substring(0, 200) + '...' : note.content

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4">
            {/* Thumbnail */}
            <div className="relative flex-shrink-0 w-40 h-24 bg-muted rounded overflow-hidden">
              {note.thumbnailUrl && (
                <img
                  src={note.thumbnailUrl}
                  alt="Video thumbnail"
                  className="w-full h-full object-cover"
                  onError={e => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                  }}
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  className="rounded-full h-10 w-10 p-0"
                  onClick={() => setIsPreviewOpen(true)}
                >
                  <Play className="h-5 w-5" />
                </Button>
              </div>
              {note.isReposted && (
                <div className="absolute top-2 right-2">
                  <Badge variant="default" className="bg-green-500 text-white">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {t('pages.videoNotes.reposted')}
                  </Badge>
                </div>
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
                      onClick={handleRepost}
                      className="cursor-pointer"
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      {t('pages.videoNotes.repostAsVideo')}
                    </Button>
                  )}
                  {note.isReposted && (
                    <Button size="sm" variant="outline" disabled>
                      {t('pages.videoNotes.alreadyReposted')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Video Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t('pages.videoNotes.preview')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <video
              controls
              autoPlay
              className="w-full rounded border shadow"
              style={{ maxWidth: '80dvw', maxHeight: '80dvh' }}
              crossOrigin="anonymous"
            >
              {note.videoUrls.map((url, idx) => (
                <source key={idx} src={url} />
              ))}
              Your browser does not support the video tag.
            </video>
            {note.content && (
              <div className="text-sm text-muted-foreground p-4 bg-muted rounded">
                <p className="whitespace-pre-wrap break-words">{note.content}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function VideoNotesPage() {
  const { t } = useTranslation()
  const { notes, loading, hasUser } = useVideoNotes()

  if (!hasUser) {
    return (
      <div className="container mx-auto py-6 max-w-4xl px-4">
        <h1 className="text-3xl font-bold mb-6">{t('pages.videoNotes.title')}</h1>
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">{t('pages.videoNotes.loginRequired')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="container mx-auto py-6 max-w-4xl px-4">
        <h1 className="text-3xl font-bold mb-6">{t('pages.videoNotes.title')}</h1>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <VideoCardSkeleton key={i} format="horizontal" />
          ))}
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
          {notes.map(note => (
            <VideoNoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </div>
  )
}
