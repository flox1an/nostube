import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { InstanceConfig } from '@nostube/core/instance-config'
import { buildShareLinks } from '@nostube/core/share-links'
import { getPublishDate, type VideoEvent } from '@nostube/core/video-event'
import { formatDate } from '@nostube/widgets'
import ShareButton from '@nostube/widgets/components/ShareButton'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { VideoPlayer } from '@nostube/widgets/player'
import { AgeConfirm } from './AgeConfirm'
import { Breadcrumb } from './Breadcrumb'
import type { AgeGate } from './use-age-gate'
import { playerBoxStyle } from './player-box'
import { useEscapeToHome } from './use-escape-to-home'
import { useVideoById } from './use-video-by-id'
import { videoPath } from './video-path'

/** One video at its own URL (`/v/<naddr>`), so it can be shared and opened directly. */
export function VideoView({
  config,
  gate,
  authorName,
  picture,
}: {
  config: InstanceConfig
  gate: AgeGate
  authorName?: string
  picture?: string
}) {
  const { id } = useParams()
  const lookup = useVideoById(id, config)
  const navigate = useNavigate()
  const video = lookup.status === 'found' ? lookup.video : null
  useEscapeToHome()

  useEffect(() => {
    if (video) document.title = `${video.title} – ${config.title}`
    return () => {
      document.title = config.title
    }
  }, [video, config.title])

  const crumb = (current?: ReactNode) => (
    <Breadcrumb title={config.title} picture={picture} current={current} />
  )
  const notice = (message: string) => (
    <div className="space-y-2">
      {crumb()}
      <p className="py-12 text-center text-muted-foreground">{message}</p>
    </div>
  )

  if (lookup.status === 'invalid') return notice('This video link is not valid.')
  if (lookup.status === 'not-found') return notice('Video not found.')
  if (!video) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading video">
        {crumb(<Skeleton className="inline-block h-4 w-40 align-middle" />)}
        <Skeleton className="aspect-video w-full rounded-lg" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/4" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {crumb(video.title)}
      {gate.isLocked(video) ? (
        <AgeConfirm onConfirm={gate.confirm} onCancel={() => navigate('/')} />
      ) : (
        <VideoDetails video={video} config={config} gate={gate} authorName={authorName} />
      )}
    </div>
  )
}

function VideoDetails({
  video,
  config,
  gate,
  authorName,
}: {
  video: VideoEvent
  config: InstanceConfig
  gate: AgeGate
  authorName?: string
}) {
  const [shareOpen, setShareOpen] = useState(false)
  // The canonical origin (not whatever host the viewer used) makes the link and the embed stable.
  const shareUrl = `${config.origin}${videoPath(video)}`
  const shareLinks = useMemo(
    () => buildShareLinks(shareUrl, shareUrl, video.title, video.images[0] ?? ''),
    [shareUrl, video.title, video.images]
  )

  return (
    <article className="space-y-3">
      {/* Edge to edge on a phone: cancel the page's side padding. */}
      <div className="-mx-4 sm:mx-0">
        <div
          className="mx-auto overflow-hidden sm:rounded-lg"
          style={playerBoxStyle(video.dimensions)}
        >
          <VideoPlayer
            key={video.id}
            urls={video.urls}
            textTracks={video.textTracks}
            mime={video.mimeType ?? ''}
            mediaType={video.mediaType}
            poster={video.images[0] ?? ''}
            posterHash={video.thumbnailVariants[0]?.hash}
            sha256={video.x}
            authorPubkey={video.pubkey}
            eventId={video.id}
            videoVariants={video.videoVariants}
            contentWarning={gate.warningFor(video)}
            title={video.title}
            authorName={authorName}
            className="h-full w-full"
          />
        </div>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2 className="text-xl font-semibold">{video.title}</h2>
          <p className="text-sm text-muted-foreground">{formatDate(getPublishDate(video))}</p>
        </div>
        <ShareButton
          shareOpen={shareOpen}
          setShareOpen={setShareOpen}
          shareUrl={shareUrl}
          shareLinks={shareLinks}
        />
      </div>
      {video.description && (
        <p className="whitespace-pre-line text-sm text-muted-foreground">{video.description}</p>
      )}
      {video.tags.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Tags">
          {video.tags.map(tag => (
            <li key={tag} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
              #{tag}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
