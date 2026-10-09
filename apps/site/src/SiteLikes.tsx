import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ThumbsUp } from 'lucide-react'
import { map } from 'rxjs/operators'
import type { Filter, NostrEvent } from 'nostr-tools'
import { use$, useActiveAccount, useEventStore } from 'applesauce-react/hooks'
import { isAddressableKind, type VideoEvent } from '@nostube/core/video-event'
import { useNostubeHost } from '@nostube/widgets/host'
import { Button } from '@nostube/widgets/components/button'
import { AuthDialog } from '@nostube/widgets/components/auth/AuthDialog'

type LikeTarget = Pick<VideoEvent, 'id' | 'kind' | 'pubkey' | 'identifier'>

/** `kind:pubkey:d` of an addressable video; a missing `d` tag is the empty identifier (NIP-01). */
function videoAddress(video: LikeTarget): string | undefined {
  return isAddressableKind(video.kind)
    ? `${video.kind}:${video.pubkey}:${video.identifier ?? ''}`
    : undefined
}

function lastTag(event: NostrEvent, name: string): string | undefined {
  for (let i = event.tags.length - 1; i >= 0; i--) {
    if (event.tags[i][0] === name) return event.tags[i][1]
  }
  return undefined
}

/** NIP-25 tags of a like: the exact address of an addressable video plus its event id. */
export function buildLikeTags(video: LikeTarget): string[][] {
  const address = videoAddress(video)
  return [
    ...(address ? [['a', address]] : []),
    ['e', video.id],
    ['p', video.pubkey],
    ['k', String(video.kind)],
  ]
}

/**
 * Whether a reaction is a like (`+` or empty, NIP-25) of this video. Relay tag filters only say
 * the id or address appears somewhere, so a like of a comment that also tags the video must not count.
 */
export function isVideoLike(event: NostrEvent, video: LikeTarget): boolean {
  if (event.kind !== 7 || (event.content !== '+' && event.content !== '')) return false
  const kind = lastTag(event, 'k')
  if (kind !== undefined && kind !== String(video.kind)) return false
  const author = lastTag(event, 'p')
  if (author !== undefined && author !== video.pubkey) return false
  if (lastTag(event, 'e') === video.id) return true
  const address = videoAddress(video)
  return address !== undefined && event.tags.some(t => t[0] === 'a' && t[1] === address)
}

/** The like button of a video: everyone sees the count, signed-in visitors like it once. */
export function SiteLikes({ video, relays }: { video: VideoEvent; relays: string[] }) {
  const { t } = useTranslation()
  const { pool } = useNostubeHost()
  const eventStore = useEventStore()
  const account = useActiveAccount()
  const [authOpen, setAuthOpen] = useState(false)
  // Pending and failed state belong to one video and one visitor, so either changing resets them.
  const key = `${video.id}|${account?.pubkey ?? ''}`
  const inFlight = useRef(new Set<string>())
  const [pending, setPending] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)

  const address = videoAddress(video)
  const filters = useMemo<Filter[]>(
    () => [{ kinds: [7], '#e': [video.id] }, ...(address ? [{ kinds: [7], '#a': [address] }] : [])],
    [video.id, address]
  )

  useEffect(() => {
    const subscription = pool.request(relays, filters).subscribe(e => eventStore.add(e))
    return () => subscription.unsubscribe()
  }, [pool, relays, filters, eventStore])

  // The store drops reactions their own authors deleted, so fetch those deletions too.
  const reactionIds = use$(
    () =>
      eventStore.timeline(filters).pipe(
        map(events =>
          events
            .map(e => e.id)
            .sort()
            .join(',')
        )
      ),
    [eventStore, filters]
  )
  useEffect(() => {
    if (!reactionIds) return
    const subscription = pool
      .request(relays, [{ kinds: [5], '#e': reactionIds.split(',') }])
      .subscribe(e => eventStore.add(e))
    return () => subscription.unsubscribe()
  }, [pool, relays, reactionIds, eventStore])

  const reactions = use$(() => eventStore.timeline(filters), [eventStore, filters])
  // One like per visitor, however many `+` reactions they sent.
  const likers = useMemo(
    () => new Set((reactions ?? []).filter(e => isVideoLike(e, video)).map(e => e.pubkey)),
    [reactions, video]
  )
  const liked = !!account && likers.has(account.pubkey)
  const busy = pending === key

  const like = async () => {
    if (!account) {
      setAuthOpen(true)
      return
    }
    if (liked || inFlight.current.has(key)) return
    inFlight.current.add(key)
    setPending(key)
    setFailure(null)
    try {
      const signed = (await account.signer.signEvent({
        kind: 7,
        content: '+',
        tags: [...buildLikeTags(video), ['client', 'nostube']],
        created_at: Math.floor(Date.now() / 1000),
      })) as unknown as NostrEvent
      // Only a relay's OK(true) counts; no relay, a refusal or a timeout leaves it retryable.
      const results = await pool.publish(relays, signed)
      if (!results.some(r => r.ok)) {
        throw new Error(
          results.length
            ? results.map(r => `${r.from}: ${r.message || t('site.reactions.refused')}`).join('; ')
            : t('site.reactions.noRelays')
        )
      }
      eventStore.add(signed)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      setFailure({ key, message: t('site.reactions.failed', { reason }) })
    } finally {
      inFlight.current.delete(key)
      setPending(current => (current === key ? null : current))
    }
  }

  const error = failure?.key === key ? failure.message : null

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant={liked ? 'secondary' : 'outline'}
        size="sm"
        className="gap-2"
        aria-pressed={liked}
        aria-busy={busy}
        aria-label={
          busy ? t('site.reactions.liking') : t('site.reactions.label', { count: likers.size })
        }
        title={account ? undefined : t('site.reactions.signInToLike')}
        disabled={busy || liked}
        onClick={() => void like()}
      >
        <ThumbsUp className={liked ? 'h-4 w-4 fill-current' : 'h-4 w-4'} aria-hidden />
        <span aria-hidden>{likers.size}</span>
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {!account && (
        <AuthDialog
          isOpen={authOpen}
          onClose={() => setAuthOpen(false)}
          onLogin={() => setAuthOpen(false)}
          relays={relays}
        />
      )}
    </div>
  )
}
