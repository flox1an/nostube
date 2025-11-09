import { useCurrentUser, useNostrPublish, useAppContext } from '@/hooks'
import { useReactions } from '@/hooks/useReactions'
import { useEventStore } from 'applesauce-react/hooks'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { HeartIcon } from 'lucide-react'
import { cn, nowInSecs } from '@/lib/utils'

interface ButtonWithReactionsProps {
  eventId: string
  kind: number
  authorPubkey: string
  relays?: string[]
  className?: string
}

export function ButtonWithReactions({
  eventId,
  kind,
  authorPubkey,
  relays = [],
  className,
}: ButtonWithReactionsProps) {
  const { user } = useCurrentUser()
  const eventStore = useEventStore()
  const { config } = useAppContext()
  const { publish, isPending } = useNostrPublish()

  // Use the new useReactions hook to load reactions from relays
  const reactions = useReactions({ eventId, authorPubkey, kind, relays })

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
