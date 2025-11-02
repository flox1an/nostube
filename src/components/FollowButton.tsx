import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useEventStore, useEventModel } from 'applesauce-react/hooks'
import { useNostrPublish } from '@/hooks/useNostrPublish'
import { ContactsModel } from 'applesauce-core/models'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { UserPlusIcon, UserCheckIcon } from 'lucide-react'
import { cn, nowInSecs } from '@/lib/utils'
import { useAppContext } from '@/hooks/useAppContext'

interface FollowButtonProps {
  pubkey: string
  className?: string
}

export function FollowButton({ pubkey, className }: FollowButtonProps) {
  const { user } = useCurrentUser()
  const eventStore = useEventStore()
  const { config } = useAppContext()
  const { publish, isPending } = useNostrPublish()

  // Use ContactsModel to get user's contact list
  const contacts = useEventModel(ContactsModel, user?.pubkey ? [user.pubkey] : null) || []

  // Check if we're following this pubkey
  const isFollowing = contacts.some(contact => contact.pubkey === pubkey)

  const handleFollow = async () => {
    if (!user) return

    // Get the current contact list event from EventStore
    const currentContactEvent = eventStore.getReplaceable(3, user.pubkey)

    // Prepare the new contact list
    let tags: string[][] = []

    if (currentContactEvent) {
      // Start with existing tags, excluding the target pubkey
      tags = currentContactEvent.tags.filter(tag => tag[0] === 'p' && tag[1] !== pubkey)
    }

    // Add the new pubkey if we're following (toggle behavior)
    if (!isFollowing) {
      tags.push(['p', pubkey])
    }

    try {
      // Publish the new contact list
      const signedEvent = await publish({
        event: {
          kind: 3,
          created_at: nowInSecs(),
          content: currentContactEvent?.content || '', // Preserve existing content
          tags,
        },
        relays: config.relays.filter(r => r.tags.includes('write')).map(r => r.url),
      })

      // Add the contact list to the event store immediately for instant feedback
      eventStore.add(signedEvent)
    } catch (error) {
      console.error('Failed to publish follow/unfollow:', error)
    }
  }

  if (!user || user.pubkey === pubkey) {
    return null
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={isFollowing ? 'secondary' : 'default'}
          size="sm"
          className={cn('space-x-2', className)}
          onClick={handleFollow}
          disabled={isPending}
        >
          {isFollowing ? (
            <>
              <UserCheckIcon className="h-5 w-5" />
              <span>Following</span>
            </>
          ) : (
            <>
              <UserPlusIcon className="h-5 w-5" />
              <span>Follow</span>
            </>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isFollowing ? 'Unfollow' : 'Follow'}</TooltipContent>
    </Tooltip>
  )
}
