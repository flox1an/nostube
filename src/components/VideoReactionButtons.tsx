import { useMemo } from 'react'
import {
  useCurrentUser,
  useNostrPublish,
  useAppContext,
  useEventStats,
  useUserReactionStatus,
  useProfile,
  useDialogState,
} from '@/hooks'
import { useUserRelays } from '@/hooks/useUserRelays'
import { useEventStore } from 'applesauce-react/hooks'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { cn, nowInSecs } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ZapButton } from './ZapButton'
import { ReactionsDialog } from './ReactionsDialog'

interface VideoReactionButtonsProps {
  eventId: string
  kind: number
  authorPubkey: string
  relays?: string[]
  className?: string
  layout?: 'vertical' | 'inline' // vertical: count below (Shorts), inline: count inside button (VideoPage)
  currentTime?: number // Current video playback position (for timestamped zaps)
  identifier?: string // d-tag for addressable events (kinds 34235, 34236)
}

export function VideoReactionButtons({
  eventId,
  kind,
  authorPubkey,
  relays = [],
  className = '',
  layout = 'vertical',
  currentTime,
  identifier,
}: VideoReactionButtonsProps) {
  const { user } = useCurrentUser()
  const eventStore = useEventStore()
  const { config } = useAppContext()
  const { publish, isPending } = useNostrPublish()

  const isOwnContent = user?.pubkey === authorPubkey

  // Get author's profile to check for lightning address
  const authorProfile = useProfile({ pubkey: authorPubkey })
  const hasLightningAddress = Boolean(authorProfile?.lud16 || authorProfile?.lud06)

  // Get author's inbox relays (NIP-65)
  const authorRelays = useUserRelays(authorPubkey)

  // Use unified event stats hook (cached + background fetch)
  const { upvoteCount, downvoteCount, reactions } = useEventStats({
    eventId,
    authorPubkey,
    kind,
    relays,
    identifier,
  })

  // Check if current user has reacted
  const { hasUpvoted, hasDownvoted } = useUserReactionStatus(reactions, user?.pubkey)
  const hasReacted = hasUpvoted || hasDownvoted

  // Dialog state for reactions list
  const reactionsDialog = useDialogState()
  const totalReactions = upvoteCount + downvoteCount

  const handleCountClick = () => {
    if (totalReactions > 0) {
      reactionsDialog.openDialog()
    }
  }

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
  // NIP-65: Use both write and read relays for mentions (where author checks)
  const targetRelays = useMemo(() => {
    const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)
    const videoSeenRelays = videoEvent ? Array.from(getSeenRelays(videoEvent) || []) : []
    const authorInboxRelays =
      authorRelays.data?.filter(r => r.write || r.read).map(r => r.url) || []
    return Array.from(new Set([...videoSeenRelays, ...authorInboxRelays, ...writeRelays]))
  }, [config.relays, videoEvent, authorRelays.data])

  // Build address for addressable events (kinds 34235, 34236)
  const isAddressable = kind === 34235 || kind === 34236
  const videoAddress = useMemo(() => {
    if (isAddressable && identifier) {
      return `${kind}:${authorPubkey}:${identifier}`
    }
    return null
  }, [isAddressable, kind, authorPubkey, identifier])

  // Build reaction tags - include both 'a' and 'e' for addressable events
  const buildReactionTags = (): string[][] => {
    const tags: string[][] = [
      ['p', authorPubkey],
      ['k', `${kind}`],
    ]

    if (videoAddress) {
      // For addressable events: include both address and event ID for compatibility
      tags.unshift(['a', videoAddress])
      tags.push(['e', eventId]) // Add 'e' tag for backwards compatibility
    } else {
      // For regular events: just use event ID
      tags.unshift(['e', eventId])
    }

    return tags
  }

  const handleUpvote = async () => {
    if (!user || hasReacted) return

    try {
      const signedEvent = await publish({
        event: {
          kind: 7,
          created_at: nowInSecs(),
          content: '+',
          tags: buildReactionTags(),
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
          tags: buildReactionTags(),
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
    // Render static display for own content or when not logged in
    if (isOwnContent || !user) {
      return (
        <>
          <div
            className={cn('inline-flex items-center gap-1 p-2 text-muted-foreground', className)}
          >
            <ThumbsUp className="h-5 w-5" />
            <button
              type="button"
              className={cn('ml-1 md:ml-2', totalReactions > 0 && 'cursor-pointer hover:underline')}
              onClick={handleCountClick}
              disabled={totalReactions === 0}
            >
              {upvoteCount}
            </button>
          </div>
          <div
            className={cn('inline-flex items-center gap-1 p-2 text-muted-foreground', className)}
          >
            <ThumbsDown className="h-5 w-5" />
            <button
              type="button"
              className={cn('ml-1 md:ml-2', totalReactions > 0 && 'cursor-pointer hover:underline')}
              onClick={handleCountClick}
              disabled={totalReactions === 0}
            >
              {downvoteCount}
            </button>
          </div>
          {hasLightningAddress && (
            <ZapButton
              eventId={eventId}
              kind={kind}
              authorPubkey={authorPubkey}
              layout="inline"
              className={className}
            />
          )}
          <ReactionsDialog
            open={reactionsDialog.open}
            onOpenChange={reactionsDialog.setOpen}
            reactions={reactions}
          />
        </>
      )
    }

    return (
      <>
        <div className="inline-flex items-center">
          <Button
            variant="ghost"
            className={cn('pr-0', className)}
            onClick={handleUpvote}
            disabled={!user || isPending || hasReacted}
            aria-label="Upvote"
          >
            <ThumbsUp className={cn('h-5 w-5', hasUpvoted && 'fill-current/80')} />
          </Button>
          <button
            type="button"
            className={cn(
              'px-1 py-2 text-sm md:px-2',
              totalReactions > 0 && 'cursor-pointer hover:underline'
            )}
            onClick={handleCountClick}
            disabled={totalReactions === 0}
          >
            {upvoteCount}
          </button>
        </div>
        <div className="inline-flex items-center">
          <Button
            variant="ghost"
            className={cn('pr-0', className)}
            onClick={handleDownvote}
            disabled={!user || isPending || hasReacted}
            aria-label="Downvote"
          >
            <ThumbsDown className={cn('h-5 w-5', hasDownvoted && 'fill-current/80')} />
          </Button>
          <button
            type="button"
            className={cn(
              'px-1 py-2 text-sm md:px-2',
              totalReactions > 0 && 'cursor-pointer hover:underline'
            )}
            onClick={handleCountClick}
            disabled={totalReactions === 0}
          >
            {downvoteCount}
          </button>
        </div>
        {hasLightningAddress && (
          <ZapButton
            eventId={eventId}
            kind={kind}
            authorPubkey={authorPubkey}
            layout="inline"
            className={className}
            currentTime={currentTime}
          />
        )}
        <ReactionsDialog
          open={reactionsDialog.open}
          onOpenChange={reactionsDialog.setOpen}
          reactions={reactions}
        />
      </>
    )
  }

  // ShortsPage layout: count below button (vertical)
  // Render static display for own content or when not logged in
  if (isOwnContent || !user) {
    return (
      <>
        <div className={cn('flex flex-col items-center gap-1', className)}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <ThumbsUp className="h-5 w-5" />
          </div>
          <button
            type="button"
            className={cn(
              'text-sm font-medium',
              totalReactions > 0 && 'cursor-pointer hover:underline'
            )}
            onClick={handleCountClick}
            disabled={totalReactions === 0}
          >
            {upvoteCount}
          </button>
        </div>
        <div className={cn('flex flex-col items-center gap-1', className)}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <ThumbsDown className="h-5 w-5" />
          </div>
          <button
            type="button"
            className={cn(
              'text-sm font-medium',
              totalReactions > 0 && 'cursor-pointer hover:underline'
            )}
            onClick={handleCountClick}
            disabled={totalReactions === 0}
          >
            {downvoteCount}
          </button>
        </div>
        {hasLightningAddress && (
          <ZapButton
            eventId={eventId}
            kind={kind}
            authorPubkey={authorPubkey}
            layout="vertical"
            className={className}
            currentTime={currentTime}
          />
        )}
        <ReactionsDialog
          open={reactionsDialog.open}
          onOpenChange={reactionsDialog.setOpen}
          reactions={reactions}
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
        <button
          type="button"
          className={cn(
            'text-sm font-medium',
            totalReactions > 0 && 'cursor-pointer hover:underline'
          )}
          onClick={handleCountClick}
          disabled={totalReactions === 0}
        >
          {upvoteCount}
        </button>
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
        <button
          type="button"
          className={cn(
            'text-sm font-medium',
            totalReactions > 0 && 'cursor-pointer hover:underline'
          )}
          onClick={handleCountClick}
          disabled={totalReactions === 0}
        >
          {downvoteCount}
        </button>
      </div>
      {hasLightningAddress && (
        <ZapButton
          eventId={eventId}
          kind={kind}
          authorPubkey={authorPubkey}
          layout="vertical"
          className={className}
        />
      )}
      <ReactionsDialog
        open={reactionsDialog.open}
        onOpenChange={reactionsDialog.setOpen}
        reactions={reactions}
      />
    </>
  )
}
