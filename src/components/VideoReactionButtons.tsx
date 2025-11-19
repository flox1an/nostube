import { useCurrentUser, useNostrPublish, useAppContext } from '@/hooks'
import { useReactions } from '@/hooks/useReactions'
import { useEventStore } from 'applesauce-react/hooks'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { nowInSecs } from '@/lib/utils'

interface VideoReactionButtonsProps {
  eventId: string
  kind: number
  authorPubkey: string
  relays?: string[]
  className?: string
}

export function VideoReactionButtons({
  eventId,
  kind,
  authorPubkey,
  relays = [],
  className = '',
}: VideoReactionButtonsProps) {
  const { user } = useCurrentUser()
  const eventStore = useEventStore()
  const { config } = useAppContext()
  const { publish, isPending } = useNostrPublish()

  // Use the useReactions hook to load reactions from relays
  const reactions = useReactions({ eventId, authorPubkey, kind, relays })

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
    if (!user) return

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
    if (!user) return

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

  return (
    <>
      {/* Upvote button */}
      <div className={`flex flex-col items-center gap-1 ${className}`}>
        <button
          className="bg-black/50 hover:bg-black/70 rounded-full p-3 border border-white/20 transition-colors disabled:opacity-50"
          onClick={handleUpvote}
          disabled={!user || isPending}
          aria-label="Upvote"
        >
          <ThumbsUp className="h-6 w-6 text-white" />
        </button>
        <span className="text-white text-sm font-medium">{upvoteCount}</span>
      </div>

      {/* Downvote button */}
      <div className={`flex flex-col items-center gap-1 ${className}`}>
        <button
          className="bg-black/50 hover:bg-black/70 rounded-full p-3 border border-white/20 transition-colors disabled:opacity-50"
          onClick={handleDownvote}
          disabled={!user || isPending}
          aria-label="Downvote"
        >
          <ThumbsDown className="h-6 w-6 text-white" />
        </button>
        <span className="text-white text-sm font-medium">{downvoteCount}</span>
      </div>
    </>
  )
}
