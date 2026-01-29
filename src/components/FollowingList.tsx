import React from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '@/hooks/useProfile'
import { UserAvatar } from '@/components/UserAvatar'
import { Skeleton } from '@/components/ui/skeleton'
import { buildProfileUrlFromPubkey } from '@/lib/nprofile'

interface FollowingItemProps {
  pubkey: string
  relays: string[]
}

const FollowingItem = React.memo(function FollowingItem({ pubkey, relays }: FollowingItemProps) {
  const metadata = useProfile({ pubkey })
  const displayName = metadata?.display_name || metadata?.name || pubkey.slice(0, 12) + '...'
  const profileUrl = buildProfileUrlFromPubkey(pubkey, relays)

  return (
    <Link
      to={profileUrl}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
    >
      <UserAvatar
        picture={metadata?.picture}
        pubkey={pubkey}
        name={displayName}
        className="h-12 w-12"
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{displayName}</p>
        {metadata?.nip05 && (
          <p className="text-sm text-muted-foreground truncate">{metadata.nip05}</p>
        )}
      </div>
    </Link>
  )
})

interface FollowingListProps {
  pubkeys: string[]
  relays: string[]
  isLoading?: boolean
}

export const FollowingList = React.memo(function FollowingList({
  pubkeys,
  relays,
  isLoading = false,
}: FollowingListProps) {
  if (isLoading) {
    return (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (pubkeys.length === 0) {
    return null
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {pubkeys.map(pubkey => (
        <FollowingItem key={pubkey} pubkey={pubkey} relays={relays} />
      ))}
    </div>
  )
})
