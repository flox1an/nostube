import { useCurrentUser } from '@/hooks'
import { useFollowSet } from '@/hooks/useFollowSet'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { UserPlusIcon, UserCheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FollowButtonProps {
  pubkey: string
  className?: string
}

export function FollowButton({ pubkey, className }: FollowButtonProps) {
  const { user } = useCurrentUser()
  const { followedPubkeys, addFollow, removeFollow, isLoading } = useFollowSet()

  // Check if we're following this pubkey
  const isFollowing = followedPubkeys.includes(pubkey)

  const handleFollow = async () => {
    if (!user) return

    try {
      if (isFollowing) {
        await removeFollow(pubkey)
      } else {
        await addFollow(pubkey)
      }
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
          disabled={isLoading}
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
