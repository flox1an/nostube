import { useMemo } from 'react'
import {
  useCurrentUser,
  useNostrPublish,
  useAppContext,
  useEventStats,
  useUserReactionStatus,
} from '@/hooks'
import { useUserRelays } from '@/hooks/useUserRelays'
import { useEventStore } from 'applesauce-react/hooks'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { cn, nowInSecs } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ZapButton } from './ZapButton'

interface VideoReactionButtonsProps {
  eventId: string
  kind: number
  authorPubkey: string
  relays?: string[]
  className?: string
  layout?: 'vertical' | 'inline' // vertical: count below (Shorts), inline: count inside button (VideoPage)
}

export function VideoReactionButtons({
  eventId,
  kind,
  authorPubkey,
  relays = [],
  className = '',
  layout = 'vertical',
}: VideoReactionButtonsProps) {
  const { user } = useCurrentUser()
  const eventStore = useEventStore()
  const { config } = useAppContext()
  const { publish, isPending } = useNostrPublish()

  const isOwnContent = user?.pubkey === authorPubkey

  // Get author's inbox relays (NIP-65)
  const authorRelays = useUserRelays(authorPubkey)

  // Use unified event stats hook (cached + background fetch)
  const { upvoteCount, downvoteCount, reactions } = useEventStats({
    eventId,
    authorPubkey,
    kind,
    relays,
  })

  // Check if current user has reacted
  const { hasUpvoted, hasDownvoted } = useUserReactionStatus(reactions, user?.pubkey)
  const hasReacted = hasUpvoted || hasDownvoted

  // Get video event from store to access seenRelays
  const videoEvent = useMemo(() => {
    // Try addressable event first (kind 34235/34236)
    if (kind === 34235 || kind === 34236) {
      return eventStore.getReplaceable(kind, authorPubkey)
    }
    // Fall back to regular event
    return eventStore.getEvent(eventId)
  }, [eventStore, eventId, kind, authorPubkey])

  // Compute target relays: video seenRelays + author inbox + user write relays
  const targetRelays = useMemo(() => {
    const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)
    const videoSeenRelays = videoEvent ? Array.from(getSeenRelays(videoEvent) || []) : []
    const authorInboxRelays = authorRelays.data?.filter(r => r.write).map(r => r.url) || []
    return Array.from(new Set([...videoSeenRelays, ...authorInboxRelays, ...writeRelays]))
  }, [config.relays, videoEvent, authorRelays.data])

  const handleUpvote = async () => {
    if (!user || hasReacted) return

    try {
      const signedEvent = await publish({
        event: {
          kind: 7,
          created_at: nowInSecs(),
          content: '+',
          tags: [
            ['e', eventId],
            ['p', authorPubkey],
            ['k', `${kind}`],
          ],
        },
        relays: targetRelays,
      })

      // Add the reaction to the event store immediately for instant feedback
      eventStore.add(signedEvent)
    } catch (error) {
      console.error('Failed to publish upvote:', error)
    }
  }

  const handleDownvote = async () => {
    if (!user || hasReacted) return

    try {
      const signedEvent = await publish({
        event: {
          kind: 7,
          created_at: nowInSecs(),
          content: '-',
          tags: [
            ['e', eventId],
            ['p', authorPubkey],
            ['k', `${kind}`],
          ],
        },
        relays: targetRelays,
      })

      // Add the reaction to the event store immediately for instant feedback
      eventStore.add(signedEvent)
    } catch (error) {
      console.error('Failed to publish downvote:', error)
    }
  }

  if (layout === 'inline') {
    // VideoPage layout: count inside button
    // Render static display for own content
    if (isOwnContent) {
      return (
        <>
          <div
            className={cn('inline-flex items-center gap-1 p-2 text-muted-foreground', className)}
          >
            <ThumbsUp className="h-5 w-5" />
            <span className="ml-1 md:ml-2">{upvoteCount}</span>
          </div>
          <div
            className={cn('inline-flex items-center gap-1 p-2 text-muted-foreground', className)}
          >
            <ThumbsDown className="h-5 w-5" />
            <span className="ml-1 md:ml-2">{downvoteCount}</span>
          </div>
          <ZapButton
            eventId={eventId}
            kind={kind}
            authorPubkey={authorPubkey}
            layout="inline"
            className={className}
          />
        </>
      )
    }

    return (
      <>
        <Button
          variant="ghost"
          className={className}
          onClick={handleUpvote}
          disabled={!user || isPending || hasReacted}
          aria-label="Upvote"
        >
          <ThumbsUp className={cn('h-5 w-5', hasUpvoted && 'fill-current/80')} />
          <span className="ml-1 md:ml-2">{upvoteCount}</span>
        </Button>
        <Button
          variant="ghost"
          className={className}
          onClick={handleDownvote}
          disabled={!user || isPending || hasReacted}
          aria-label="Downvote"
        >
          <ThumbsDown className={cn('h-5 w-5', hasDownvoted && 'fill-current/80')} />
          <span className="ml-1 md:ml-2">{downvoteCount}</span>
        </Button>
        <ZapButton
          eventId={eventId}
          kind={kind}
          authorPubkey={authorPubkey}
          layout="inline"
          className={className}
        />
      </>
    )
  }

  // ShortsPage layout: count below button (vertical)
  // Render static display for own content
  if (isOwnContent) {
    return (
      <>
        <div className={cn('flex flex-col items-center gap-1', className)}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <ThumbsUp className="h-5 w-5" />
          </div>
          <span className="text-sm font-medium">{upvoteCount}</span>
        </div>
        <div className={cn('flex flex-col items-center gap-1', className)}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <ThumbsDown className="h-5 w-5" />
          </div>
          <span className="text-sm font-medium">{downvoteCount}</span>
        </div>
        <ZapButton
          eventId={eventId}
          kind={kind}
          authorPubkey={authorPubkey}
          layout="vertical"
          className={className}
        />
      </>
    )
  }

  return (
    <>
      {/* Upvote button */}
      <div className={cn('flex flex-col items-center gap-1', className)}>
        <Button
          variant="secondary"
          size="icon"
          className="rounded-full"
          onClick={handleUpvote}
          disabled={!user || isPending || hasReacted}
          aria-label="Upvote"
        >
          <ThumbsUp className={cn('h-5 w-5', hasUpvoted && 'fill-current/80')} />
        </Button>
        <span className="text-sm font-medium">{upvoteCount}</span>
      </div>

      {/* Downvote button */}
      <div className={cn('flex flex-col items-center gap-1', className)}>
        <Button
          variant="secondary"
          size="icon"
          className="rounded-full"
          onClick={handleDownvote}
          disabled={!user || isPending || hasReacted}
          aria-label="Downvote"
        >
          <ThumbsDown className={cn('h-5 w-5', hasDownvoted && 'fill-current/80')} />
        </Button>
        <span className="text-sm font-medium">{downvoteCount}</span>
      </div>
      <ZapButton
        eventId={eventId}
        kind={kind}
        authorPubkey={authorPubkey}
        layout="vertical"
        className={className}
      />
    </>
  )
}
