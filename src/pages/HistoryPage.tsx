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

export function HistoryPage() {
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
    document.title = 'Watch History - nostube'
    return () => {
      document.title = 'nostube'
    }
  }, [])

  const handleClearHistory = () => {
    setIsClearing(true)
    clearHistory()
    // Small delay for UX feedback
    setTimeout(() => {
      setIsClearing(false)
    }, 300)
  }

  return (
    <div className="sm:p-4">
      <div className="p-2 flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Watch History</h1>
        {history.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isClearing}>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear History
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear watch history?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete your entire watch history. This action cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearHistory}>Clear History</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {videos.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            Your watch history is empty. Start watching videos to see them here.
          </p>
        </div>
      ) : (
        <VideoGrid videos={videos} isLoading={false} showSkeletons={false} layoutMode="auto" />
      )}
    </div>
  )
}
