import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useEventModel, useEventStore } from 'applesauce-react/hooks'
import { useNostrPublish } from '@/hooks/useNostrPublish'
import { ReactionsModel } from 'applesauce-core/models'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { HeartIcon } from 'lucide-react'
import { cn, nowInSecs } from '@/lib/utils'
import { NostrEvent } from 'nostr-tools'
import { useAppContext } from '@/hooks/useAppContext'

interface ButtonWithReactionsProps {
  eventId: string
  kind: number
  authorPubkey: string
  className?: string
}

export function ButtonWithReactions({
  eventId,
  kind,
  authorPubkey,
  className,
}: ButtonWithReactionsProps) {
  const { user } = useCurrentUser()
  const eventStore = useEventStore()
  const { config } = useAppContext()
  const { publish, isPending } = useNostrPublish()

  // Create a dummy event object for ReactionsModel
  // ReactionsModel expects a NostrEvent, so we create a minimal one
  const dummyEvent: NostrEvent = {
    id: eventId,
    pubkey: authorPubkey,
    created_at: 0,
    kind: kind,
    tags: [],
    content: '',
    sig: '',
  }

  // Use ReactionsModel to get reactions for this event
  const reactions = useEventModel(ReactionsModel, [dummyEvent]) || []

  // Check if current user has liked
  const hasLiked =
    user && reactions.some(event => event.pubkey === user.pubkey && event.content === '+')

  // Count likes
  const likeCount = reactions.filter(event => event.content === '+').length

  const handleLike = async () => {
    if (!user) return

    // If already liked, we'll unlike by doing nothing (as reactions are ephemeral)
    if (!hasLiked) {
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
        console.error('Failed to publish like:', error)
      }
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className={cn('space-x-2', className)}
          onClick={handleLike}
          disabled={!user || isPending}
        >
          <HeartIcon
            className={cn('h-5 w-5', hasLiked ? 'fill-red-500 stroke-red-500' : 'fill-none')}
          />
          <span>{likeCount}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{user ? (hasLiked ? 'Unlike' : 'Like') : 'Login to like'}</TooltipContent>
    </Tooltip>
  )
}
