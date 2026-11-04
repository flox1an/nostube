import { useAuthorLiveStreams } from '@/hooks/useLiveStreams'
import { LiveBadge } from './LiveBadge'

/** LIVE badge shown while `pubkey` publishes or hosts a watchable live stream. */
export function AuthorLiveBadge({ pubkey }: { pubkey: string }) {
  const live = useAuthorLiveStreams(pubkey).length > 0
  return live ? <LiveBadge /> : null
}
