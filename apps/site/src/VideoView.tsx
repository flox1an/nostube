import { Link, useNavigate, useParams } from 'react-router-dom'
import type { InstanceConfig } from '@nostube/core/instance-config'
import { VideoPlayer } from '@nostube/widgets/player'
import { AgeConfirm } from './AgeConfirm'
import type { AgeGate } from './use-age-gate'
import { useVideoById } from './use-video-by-id'

/** One video at its own URL (`/v/<naddr>`), so it can be shared and opened directly. */
export function VideoView({
  config,
  gate,
  authorName,
}: {
  config: InstanceConfig
  gate: AgeGate
  authorName?: string
}) {
  const { id } = useParams()
  const lookup = useVideoById(id, config)
  const navigate = useNavigate()

  const back = (
    <Link to="/" className="text-sm text-muted-foreground hover:underline">
      ← All videos
    </Link>
  )

  if (lookup.status === 'invalid') {
    return (
      <div className="space-y-2">
        {back}
        <p className="py-12 text-center text-muted-foreground">This video link is not valid.</p>
      </div>
    )
  }
  if (lookup.status === 'loading') {
    return (
      <div className="space-y-2">
        {back}
        <p className="py-12 text-center text-muted-foreground">Loading video…</p>
      </div>
    )
  }
  if (lookup.status === 'not-found') {
    return (
      <div className="space-y-2">
        {back}
        <p className="py-12 text-center text-muted-foreground">Video not found.</p>
      </div>
    )
  }

  const selected = lookup.video
  return (
    <div className="space-y-4">
      {back}
      {gate.isLocked(selected) ? (
        <AgeConfirm onConfirm={gate.confirm} onCancel={() => navigate('/')} />
      ) : (
        <section className="space-y-2">
          <VideoPlayer
            key={selected.id}
            urls={selected.urls}
            textTracks={selected.textTracks}
            mime={selected.mimeType ?? ''}
            mediaType={selected.mediaType}
            poster={selected.images[0] ?? ''}
            posterHash={selected.thumbnailVariants[0]?.hash}
            sha256={selected.x}
            authorPubkey={selected.pubkey}
            eventId={selected.id}
            videoVariants={selected.videoVariants}
            contentWarning={gate.warningFor(selected)}
            title={selected.title}
            authorName={authorName}
          />
          <h2 className="text-lg font-medium">{selected.title}</h2>
          {selected.description && (
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {selected.description}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
