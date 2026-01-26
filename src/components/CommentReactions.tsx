import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react'
import {
  useCurrentUser,
  useNostrPublish,
  useAppContext,
  useZap,
  useEventStats,
  useUserReactionStatus,
  useProfile,
} from '@/hooks'
import { useUserRelays } from '@/hooks/useUserRelays'
import { useEventStore } from 'applesauce-react/hooks'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { ThumbsUp, ThumbsDown, Zap, Loader2, Heart } from 'lucide-react'
import { cn, nowInSecs } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { formatSats } from '@/lib/zap-utils'
import { ZapDialog } from './ZapDialog'
import { UserAvatar } from './UserAvatar'

interface CommentReactionsProps {
  eventId: string
  authorPubkey: string
  kind?: number
  className?: string
  /** Video author's pubkey to show "author liked" badge */
  videoAuthorPubkey?: string
}

const LONG_PRESS_DELAY = 500

export const CommentReactions = memo(function CommentReactions({
  eventId,
  authorPubkey,
  kind = 1111,
  className = '',
  videoAuthorPubkey,
}: CommentReactionsProps) {
  const { user } = useCurrentUser()
  const eventStore = useEventStore()
  const { config } = useAppContext()
  const { publish, isPending } = useNostrPublish()
  const videoAuthorProfile = useProfile(
    videoAuthorPubkey ? { pubkey: videoAuthorPubkey } : undefined
  )

  const [showZapDialog, setShowZapDialog] = useState(false)
  const longPressTimer = useRef<number | null>(null)
  const isLongPress = useRef(false)

  // Get the event from the store for seenRelays
  const storedEvent = useMemo(() => eventStore.getEvent(eventId), [eventStore, eventId])

  // Get author's inbox relays (NIP-65)
  const authorRelays = useUserRelays(authorPubkey)

  // Use unified event stats hook (cached + background fetch)
  const { totalSats, upvoteCount, downvoteCount, reactions } = useEventStats({
    eventId,
    authorPubkey,
    kind,
  })

  // Check if current user has reacted
  const { hasUpvoted, hasDownvoted } = useUserReactionStatus(reactions, user?.pubkey)
  const hasReacted = hasUpvoted || hasDownvoted

  // Check if video author has liked this comment
  const videoAuthorLiked = useMemo(() => {
    if (!videoAuthorPubkey || videoAuthorPubkey === authorPubkey) return false
    return reactions.some(r => r.pubkey === videoAuthorPubkey && r.content === '+')
  }, [reactions, videoAuthorPubkey, authorPubkey])

  // Use the useZap hook for zapping
  const { zap, generateInvoice, isZapping, isConnected } = useZap({
    eventId,
    authorPubkey,
  })

  const isOwnContent = user?.pubkey === authorPubkey

  // Compute target relays: comment seenRelays + author inbox + user write relays
  const targetRelays = useMemo(() => {
    const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)
    const commentSeenRelays = storedEvent ? Array.from(getSeenRelays(storedEvent) || []) : []
    const authorInboxRelays = authorRelays.data?.filter(r => r.write).map(r => r.url) || []
    return Array.from(new Set([...commentSeenRelays, ...authorInboxRelays, ...writeRelays]))
  }, [config.relays, storedEvent, authorRelays.data])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
      }
    }
  }, [])

  const handleUpvote = useCallback(async () => {
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
        relays: targetRelays,
      })

      eventStore.add(signedEvent)
    } catch (error) {
      console.error('Failed to publish upvote:', error)
    }
  }, [user, hasReacted, publish, eventId, authorPubkey, kind, targetRelays, eventStore])

  const handleDownvote = useCallback(async () => {
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
        relays: targetRelays,
      })

      eventStore.add(signedEvent)
    } catch (error) {
      console.error('Failed to publish downvote:', error)
    }
  }, [user, hasReacted, publish, eventId, authorPubkey, kind, targetRelays, eventStore])

  const handleQuickZap = useCallback(async () => {
    if (isLongPress.current) return
    // If wallet is connected, do quick zap; otherwise open dialog for QR code
    if (isConnected) {
      await zap()
    } else {
      setShowZapDialog(true)
    }
  }, [zap, isConnected])

  const handlePointerDown = useCallback(() => {
    isLongPress.current = false
    longPressTimer.current = window.setTimeout(() => {
      isLongPress.current = true
      setShowZapDialog(true)
    }, LONG_PRESS_DELAY)
  }, [])

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handlePointerLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setShowZapDialog(true)
  }, [])

  const handleZapFromDialog = useCallback(
    async (amount: number, comment?: string) => {
      return zap({ amount, comment })
    },
    [zap]
  )

  return (
    <>
      <div className={cn('flex items-center gap-1', className)}>
        {/* Upvote button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleUpvote}
          disabled={!user || isPending || hasReacted}
          aria-label="Upvote"
        >
          <ThumbsUp className={cn('w-3 h-3', hasUpvoted && 'fill-current')} />
          {upvoteCount > 0 && <span className="ml-1">{upvoteCount}</span>}
        </Button>

        {/* Downvote button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleDownvote}
          disabled={!user || isPending || hasReacted}
          aria-label="Downvote"
        >
          <ThumbsDown className={cn('w-3 h-3', hasDownvoted && 'fill-current')} />
          {downvoteCount > 0 && <span className="ml-1">{downvoteCount}</span>}
        </Button>

        {/* Zap button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleQuickZap}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onContextMenu={handleContextMenu}
          disabled={!user || isZapping || isOwnContent}
          aria-label="Zap"
        >
          {isZapping ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Zap className={cn('w-3 h-3', totalSats > 0 && 'text-yellow-500')} />
          )}
          {totalSats > 0 && <span className="ml-1">{formatSats(totalSats)}</span>}
        </Button>

        {/* Video author liked badge */}
        {videoAuthorLiked && videoAuthorPubkey && (
          <div className="relative ml-1" title="Liked by creator">
            <UserAvatar
              picture={videoAuthorProfile?.picture}
              pubkey={videoAuthorPubkey}
              name={videoAuthorProfile?.name}
              className="h-6 w-6"
            />
            <Heart className="absolute -bottom-0.5 -right-0.5 h-3 w-3 fill-red-500 text-red-500" />
          </div>
        )}
      </div>

      <ZapDialog
        open={showZapDialog}
        onOpenChange={setShowZapDialog}
        eventId={eventId}
        authorPubkey={authorPubkey}
        onZap={handleZapFromDialog}
        isZapping={isZapping}
        isWalletConnected={isConnected}
        generateInvoice={generateInvoice}
      />
    </>
  )
})
