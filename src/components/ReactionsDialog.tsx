import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { NostrEvent } from 'nostr-tools'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { UserAvatar } from '@/components/UserAvatar'
import { useProfile } from '@/hooks/useProfile'
import { useAppContext } from '@/hooks/useAppContext'
import { formatDateTime } from '@/lib/format-utils'
import { buildProfileUrlFromPubkey } from '@/lib/nprofile'
import { isDownvoteReaction } from '@/hooks/useEventStats'

interface ReactionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reactions: NostrEvent[]
}

interface ReactionItemProps {
  reaction: NostrEvent
}

const ReactionItem = React.memo(function ReactionItem({ reaction }: ReactionItemProps) {
  const metadata = useProfile({ pubkey: reaction.pubkey })
  const { config } = useAppContext()
  const displayName =
    metadata?.display_name || metadata?.name || reaction.pubkey.slice(0, 12) + '...'
  const profileUrl = buildProfileUrlFromPubkey(reaction.pubkey)

  const isDownvote = isDownvoteReaction(reaction.content)
  const isPlainUpvote = reaction.content === '+' || reaction.content === ''
  const isPlainDownvote = reaction.content === '-'

  return (
    <div className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-muted/50">
      <Link to={profileUrl} className="shrink-0">
        <UserAvatar
          picture={metadata?.picture}
          pubkey={reaction.pubkey}
          name={displayName}
          className="h-10 w-10"
          thumbResizeServerUrl={config.thumbResizeServerUrl}
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={profileUrl} className="block truncate font-medium hover:underline">
          {displayName}
        </Link>
        {metadata?.nip05 && (
          <p className="truncate text-sm text-muted-foreground">{metadata.nip05}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-sm text-muted-foreground">{formatDateTime(reaction.created_at)}</span>
        <span className="text-lg">
          {isPlainDownvote ? (
            <ThumbsDown className="h-5 w-5 text-red-500" />
          ) : isPlainUpvote ? (
            <ThumbsUp className="h-5 w-5 text-green-500" />
          ) : isDownvote ? (
            <span className="text-red-500">{reaction.content}</span>
          ) : (
            <span>{reaction.content}</span>
          )}
        </span>
      </div>
    </div>
  )
})

export function ReactionsDialog({ open, onOpenChange, reactions }: ReactionsDialogProps) {
  // Sort reactions newest first
  const sortedReactions = useMemo(
    () => [...reactions].sort((a, b) => b.created_at - a.created_at),
    [reactions]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reactions ({reactions.length})</DialogTitle>
          <DialogDescription className="sr-only">
            List of all reactions on this video
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="flex flex-col gap-1">
            {sortedReactions.map(reaction => (
              <ReactionItem key={reaction.id} reaction={reaction} />
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
