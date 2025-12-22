import { useEffect, useMemo, useState } from 'react'
import { useAppContext, useVideoHistory } from '@/hooks'
import { VideoGrid } from '@/components/VideoGrid'
import { processEvent, type VideoEvent } from '@/utils/video-event'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useTranslation } from 'react-i18next'

export function HistoryPage() {
  const { t } = useTranslation()
  const { config } = useAppContext()
  const { history, clearHistory } = useVideoHistory()
  const [isClearing, setIsClearing] = useState(false)

  // Process history events into VideoEvent format
  const videos: VideoEvent[] = useMemo(() => {
    return history
      .map(entry => {
        try {
          return processEvent(entry.event, [], config.blossomServers)
        } catch (error) {
          console.error('Error processing history event:', error)
          return null
        }
      })
      .filter((video): video is VideoEvent => video !== null)
  }, [history, config.blossomServers])

  // Update document title
  useEffect(() => {
    document.title = `${t('pages.history.title')} - nostube`
    return () => {
      document.title = 'nostube'
    }
  }, [t])

  const handleClearHistory = () => {
    setIsClearing(true)
    clearHistory()
    // Small delay for UX feedback
    setTimeout(() => {
      setIsClearing(false)
    }, 300)
  }

  return (
    <div className="max-w-560 mx-auto sm:p-4">
      <div className="p-2 flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">{t('pages.history.title')}</h1>
        {history.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isClearing}>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('pages.history.clearButton')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('pages.history.confirmTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('pages.history.confirmMessage')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearHistory}>
                  {t('pages.history.clearButton')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {videos.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('pages.history.emptyState')}</p>
        </div>
      ) : (
        <VideoGrid videos={videos} isLoading={false} showSkeletons={false} layoutMode="auto" />
      )}
    </div>
  )
}
