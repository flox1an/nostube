import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { InstanceConfig } from '@nostube/core/instance-config'
import type { VideoEvent } from '@nostube/core/video-event'
import { VideoGrid, VideoGridSkeleton } from '@nostube/widgets'
import { Alert, AlertDescription } from '@nostube/widgets/components/alert'
import { Button } from '@nostube/widgets/components/button'
import { AgeConfirm } from './AgeConfirm'
import type { AgeGate } from './use-age-gate'
import { useCreatorVideos } from './use-creator-videos'
import { videoPath } from './video-path'

/** The grid of the creator's videos; a locked video asks for 18+ before its page opens. */
export function GridPage({ config, gate }: { config: InstanceConfig; gate: AgeGate }) {
  const { t } = useTranslation()
  const { videos, loading, error, hasMore, loadMore } = useCreatorVideos(config)
  const [pending, setPending] = useState<VideoEvent | null>(null)
  const navigate = useNavigate()

  const select = (video: VideoEvent) => {
    if (gate.isLocked(video)) setPending(video)
    else navigate(videoPath(video))
  }
  const confirmAge = () => {
    gate.confirm()
    if (pending) navigate(videoPath(pending))
    setPending(null)
  }

  return (
    <>
      {pending && <AgeConfirm onConfirm={confirmAge} onCancel={() => setPending(null)} />}
      {error && (
        <Alert variant="destructive" className="flex items-center justify-between gap-4">
          <AlertDescription>{t('site.grid.loadFailed')}</AlertDescription>
          <Button type="button" variant="outline" size="sm" onClick={() => location.reload()}>
            {t('site.grid.retry')}
          </Button>
        </Alert>
      )}
      {loading ? (
        <div className="-mx-4 sm:mx-0">
          <VideoGridSkeleton />
        </div>
      ) : (
        <>
          {/* On a phone the cards run edge to edge: the page's side padding is cancelled here. */}
          <div className="-mx-4 sm:mx-0">
            <VideoGrid videos={videos} onSelect={select} isLocked={gate.isLocked} />
          </div>
          {hasMore && (
            <div className="text-center">
              <Button type="button" variant="outline" onClick={loadMore}>
                {t('site.grid.loadMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )
}
