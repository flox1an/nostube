import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { InstanceConfig } from '@nostube/core/instance-config'
import type { VideoEvent } from '@nostube/core/video-event'
import { VideoGrid } from '@nostube/widgets'
import { AgeConfirm } from './AgeConfirm'
import type { AgeGate } from './use-age-gate'
import { useCreatorVideos } from './use-creator-videos'
import { videoPath } from './video-path'

/** The grid of the creator's videos; a locked video asks for 18+ before its page opens. */
export function GridPage({ config, gate }: { config: InstanceConfig; gate: AgeGate }) {
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
      {error && <p className="text-red-600">Could not load videos.</p>}
      {loading ? (
        <p className="py-12 text-center text-muted-foreground">Loading videos…</p>
      ) : (
        <>
          <VideoGrid videos={videos} onSelect={select} isLocked={gate.isLocked} />
          {hasMore && (
            <div className="text-center">
              <button
                type="button"
                onClick={loadMore}
                className="rounded-md border border-border px-4 py-2 text-sm"
              >
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}
