import { useMemo } from 'react'
import { useCurrentUser, useNostrPublish, useAppContext } from '@/hooks'
import { useReactions } from '@/hooks/useReactions'
import { useEventStore } from 'applesauce-react/hooks'
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

  // Use the useReactions hook to load reactions from relays
  const reactions = useReactions({ eventId, authorPubkey, kind, relays })

  // Check if current user has upvoted or downvoted
  const hasUpvoted = useMemo(
    () => user && reactions.some(event => event.pubkey === user.pubkey && event.content === '+'),
    [user, reactions]
  )
  const hasDownvoted = useMemo(
    () => user && reactions.some(event => event.pubkey === user.pubkey && event.content === '-'),
    [user, reactions]
  )
  const hasReacted = hasUpvoted || hasDownvoted

  // Count upvotes (+) - deduplicate by user
  const upvoteCount = reactions
    .filter(event => event.content === '+')
    .reduce(
      (acc, event) => {
        if (!acc.seen.has(event.pubkey)) {
          acc.seen.add(event.pubkey)
          acc.count++
        }
        return acc
      },
      { seen: new Set<string>(), count: 0 }
    ).count

  // Count downvotes (-) - deduplicate by user
  const downvoteCount = reactions
    .filter(event => event.content === '-')
    .reduce(
      (acc, event) => {
        if (!acc.seen.has(event.pubkey)) {
          acc.seen.add(event.pubkey)
          acc.count++
        }
        return acc
      },
      { seen: new Set<string>(), count: 0 }
    ).count

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
        relays: config.relays.filter(r => r.tags.includes('write')).map(r => r.url),
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
        relays: config.relays.filter(r => r.tags.includes('write')).map(r => r.url),
      })

      // Add the reaction to the event store immediately for instant feedback
      eventStore.add(signedEvent)
    } catch (error) {
      console.error('Failed to publish downvote:', error)
    }
  }

  if (layout === 'inline') {
    // VideoPage layout: count inside button
    return (
      <>
        <Button
          variant="secondary"
          className={className}
          onClick={handleUpvote}
          disabled={!user || isPending || hasReacted}
          aria-label="Upvote"
        >
          <ThumbsUp className={cn('h-5 w-5', hasUpvoted && 'fill-current/80')} />
          <span className="ml-2">{upvoteCount}</span>
        </Button>
        <Button
          variant="secondary"
          className={className}
          onClick={handleDownvote}
          disabled={!user || isPending || hasReacted}
          aria-label="Downvote"
        >
          <ThumbsDown className={cn('h-5 w-5', hasDownvoted && 'fill-current/80')} />
          <span className="ml-2">{downvoteCount}</span>
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
  return (
    <>
      {/* Upvote button */}
      <div className={`flex flex-col items-center gap-1 ${className}`}>
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
      <div className={`flex flex-col items-center gap-1 ${className}`}>
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
