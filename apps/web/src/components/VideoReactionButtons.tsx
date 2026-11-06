import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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
import { Button } from '@nostube/widgets/components/button'
import { ZapButton } from './ZapButton'
import { ReactionsDialog } from './ReactionsDialog'
import { AuthDialog } from './auth/AuthDialog'

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
  const { t } = useTranslation()
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
  const authDialog = useDialogState<'upvote' | 'downvote'>()
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
    if (!user) {
      authDialog.openWith('upvote')
      return
    }
    if (hasReacted) return

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
    if (!user) {
      authDialog.openWith('downvote')
      return
    }
    if (hasReacted) return

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

  const signInDialog = (
    <AuthDialog
      isOpen={authDialog.open}
      onClose={authDialog.closeDialog}
      onLogin={authDialog.closeDialog}
      description={t(`auth.context.${authDialog.data ?? 'upvote'}`)}
    />
  )

  if (layout === 'inline') {
    // VideoPage layout: count inside button
    // Guests sign in from the compact action; own-content counts open the reactions list.
    if (isOwnContent || !user) {
      return (
        <>
          <button
            type="button"
            className={cn(
              'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-2 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              (!user || totalReactions > 0) && 'cursor-pointer hover:bg-accent',
              className
            )}
            onClick={user ? handleCountClick : handleUpvote}
            disabled={!!user && totalReactions === 0}
            aria-label={
              user ? t('video.viewUpvotes', { count: upvoteCount }) : t('auth.context.signInUpvote')
            }
          >
            <ThumbsUp className="h-5 w-5" />
            <span>{upvoteCount}</span>
          </button>
          <button
            type="button"
            className={cn(
              'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-2 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              (!user || totalReactions > 0) && 'cursor-pointer hover:bg-accent',
              className
            )}
            onClick={user ? handleCountClick : handleDownvote}
            disabled={!!user && totalReactions === 0}
            aria-label={
              user
                ? t('video.viewDownvotes', { count: downvoteCount })
                : t('auth.context.signInDownvote')
            }
          >
            <ThumbsDown className="h-5 w-5" />
            <span>{downvoteCount}</span>
          </button>
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
          {signInDialog}
        </>
      )
    }

    return (
      <>
        <div className="inline-flex items-center gap-2">
          <Button
            variant="ghost"
            className={cn('px-4', className)}
            onClick={handleUpvote}
            disabled={isPending || hasReacted}
            aria-label={user ? `Upvote, ${upvoteCount} reactions` : t('auth.context.signInUpvote')}
            aria-pressed={hasUpvoted}
          >
            <ThumbsUp className={cn('h-5 w-5', hasUpvoted && 'fill-current/80')} />
          </Button>
          <button
            type="button"
            className={cn(
              'min-h-11 min-w-11 rounded text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              totalReactions > 0 && 'cursor-pointer hover:underline'
            )}
            onClick={handleCountClick}
            disabled={totalReactions === 0}
            aria-label={t('video.viewUpvotes', { count: upvoteCount })}
          >
            {upvoteCount}
          </button>
        </div>
        <div className="inline-flex items-center gap-2">
          <Button
            variant="ghost"
            className={cn('px-4', className)}
            onClick={handleDownvote}
            disabled={isPending || hasReacted}
            aria-label={
              user ? `Downvote, ${downvoteCount} reactions` : t('auth.context.signInDownvote')
            }
            aria-pressed={hasDownvoted}
          >
            <ThumbsDown className={cn('h-5 w-5', hasDownvoted && 'fill-current/80')} />
          </Button>
          <button
            type="button"
            className={cn(
              'min-h-11 min-w-11 rounded text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              totalReactions > 0 && 'cursor-pointer hover:underline'
            )}
            onClick={handleCountClick}
            disabled={totalReactions === 0}
            aria-label={t('video.viewDownvotes', { count: downvoteCount })}
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
        {signInDialog}
      </>
    )
  }

  // ShortsPage layout: count below button (vertical)
  // Own-content counts still open the reactions list.
  if (isOwnContent) {
    return (
      <>
        <div className={cn('flex flex-col items-center gap-1', className)}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <ThumbsUp className="h-5 w-5" />
          </div>
          <button
            type="button"
            className={cn(
              'min-h-11 min-w-11 rounded text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              totalReactions > 0 && 'cursor-pointer hover:underline'
            )}
            onClick={handleCountClick}
            disabled={totalReactions === 0}
            aria-label={t('video.viewUpvotes', { count: upvoteCount })}
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
              'min-h-11 min-w-11 rounded text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              totalReactions > 0 && 'cursor-pointer hover:underline'
            )}
            onClick={handleCountClick}
            disabled={totalReactions === 0}
            aria-label={t('video.viewDownvotes', { count: downvoteCount })}
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
          disabled={isPending || hasReacted}
          aria-label={user ? `Upvote, ${upvoteCount} reactions` : t('auth.context.signInUpvote')}
          aria-pressed={hasUpvoted}
        >
          <ThumbsUp className={cn('h-5 w-5', hasUpvoted && 'fill-current/80')} />
        </Button>
        <button
          type="button"
          className={cn(
            'min-h-11 min-w-11 rounded text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            totalReactions > 0 && 'cursor-pointer hover:underline'
          )}
          onClick={handleCountClick}
          disabled={totalReactions === 0}
          aria-label={t('video.viewUpvotes', { count: upvoteCount })}
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
          disabled={isPending || hasReacted}
          aria-label={
            user ? `Downvote, ${downvoteCount} reactions` : t('auth.context.signInDownvote')
          }
          aria-pressed={hasDownvoted}
        >
          <ThumbsDown className={cn('h-5 w-5', hasDownvoted && 'fill-current/80')} />
        </Button>
        <button
          type="button"
          className={cn(
            'min-h-11 min-w-11 rounded text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            totalReactions > 0 && 'cursor-pointer hover:underline'
          )}
          onClick={handleCountClick}
          disabled={totalReactions === 0}
          aria-label={t('video.viewDownvotes', { count: downvoteCount })}
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
      {signInDialog}
    </>
  )
}
