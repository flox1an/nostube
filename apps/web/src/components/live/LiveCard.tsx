import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LiveStream } from '@nostube/core/live-stream'
import { useProfile } from '@nostube/widgets/hooks/useProfile'
import { UserAvatar } from '@nostube/widgets/components/UserAvatar'
import { LiveBadge, LiveStatusBadge } from './LiveBadge'
import { useImageCascadeChain } from '@nostube/widgets/hooks/useImageCascade'

/** Grid card for a live stream; `warning` covers the thumbnail. */
export function LiveCard({ stream, warning }: { stream: LiveStream; warning: boolean }) {
  const { t } = useTranslation()
  const profile = useProfile({ pubkey: stream.hostPubkey })
  const thumbnail = useImageCascadeChain([stream.image, stream.thumb], {
    authorPubkey: stream.hostPubkey,
  })
  const name = profile?.display_name || profile?.name || stream.hostPubkey.slice(0, 12)
  return (
    <Link
      to={`/live/${stream.naddr}`}
      className="group block min-w-0 rounded-xl p-2 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="thumb-frame aspect-video bg-muted">
        {thumbnail.src && !warning && (
          <img
            src={thumbnail.src}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            onError={thumbnail.onError}
            onLoad={thumbnail.onLoad}
          />
        )}
        {warning && (
          <span className="absolute inset-0 flex items-center justify-center text-sm">
            {t('live.contentWarning', 'Content warning')}
          </span>
        )}
        {stream.status === 'live' ? (
          <LiveBadge className="absolute bottom-2 right-2" />
        ) : (
          <LiveStatusBadge stream={stream} className="absolute bottom-2 right-2" />
        )}
        {stream.participants !== undefined && stream.status === 'live' && (
          <span className="absolute bottom-2 left-2 z-20 flex items-center gap-1 rounded-full border border-white/30 bg-black/60 px-2 py-0.5 text-xs font-semibold tabular-nums text-white backdrop-blur-sm">
            <Users className="h-3 w-3" aria-hidden="true" />
            {stream.participants.toLocaleString()}
          </span>
        )}
      </div>
      <div className="flex gap-3 pt-3">
        <UserAvatar
          pubkey={stream.hostPubkey}
          picture={profile?.picture}
          name={name}
          className="h-9 w-9 shrink-0"
        />
        <div className="min-w-0">
          <h2 className="line-clamp-2 text-sm font-semibold wrap-anywhere">{stream.title}</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">{name}</p>
        </div>
      </div>
    </Link>
  )
}
