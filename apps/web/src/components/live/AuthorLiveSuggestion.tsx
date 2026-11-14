import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '@nostube/widgets/components/UserAvatar'
import { Skeleton } from '@nostube/widgets/components/skeleton'
import { useProfile } from '@nostube/widgets/hooks/useProfile'
import { useImageCascadeChain } from '@nostube/widgets/hooks/useImageCascade'
import { useAuthorLiveStreams } from '@/hooks/useLiveStreams'
import { LiveBadge } from './LiveBadge'

/** The video author's most recent live stream, styled like a suggestion item (LIVE replaces the duration). */
export function AuthorLiveSuggestion({ pubkey, relays }: { pubkey?: string; relays: string[] }) {
  const { t } = useTranslation()
  // Content-warned streams stay out of suggestions; they need a deliberate click.
  const stream = useAuthorLiveStreams(pubkey, relays).find(item => item.playback === 'play')?.stream
  const metadata = useProfile(stream ? { pubkey: stream.hostPubkey } : undefined)
  const cascade = useImageCascadeChain([stream?.image, stream?.thumb], {
    authorPubkey: stream?.hostPubkey,
  })
  if (!stream) return null
  const name = metadata?.name || stream.hostPubkey.slice(0, 8)

  return (
    <Link
      to={`/live/${stream.naddr}`}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      data-author-live-suggestion
    >
      <div className="relative flex gap-3 rounded-xl px-2 py-1.5 motion-safe:transition-colors motion-safe:duration-150 hover:bg-accent/55 motion-reduce:transition-none">
        <div className="relative w-40 xl:w-48 2xl:w-64 aspect-video shrink-0 overflow-hidden rounded-xl ring-1 ring-inset ring-black/10 shadow-sm dark:ring-white/10">
          {!cascade.loaded && <Skeleton className="w-full h-full absolute inset-0" />}
          {cascade.src && (
            <img
              src={cascade.src}
              loading="lazy"
              alt={stream.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
              onError={cascade.onError}
              onLoad={cascade.onLoad}
            />
          )}
          <LiveBadge className="absolute bottom-1 right-1" />
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="text-sm font-semibold leading-5 tracking-[-0.01em] line-clamp-3">
            {stream.title}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            <UserAvatar
              picture={metadata?.picture}
              pubkey={stream.hostPubkey}
              name={name}
              className="h-4 w-4"
            />
            <div className="text-xs text-muted-foreground">{name}</div>
          </div>
          {stream.participants !== undefined && (
            <div className="text-xs text-muted-foreground mt-1">
              {t('live.viewers', {
                defaultValue: '{{count}} watching',
                count: stream.participants,
              })}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
