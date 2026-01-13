import { useEventStore, use$ } from 'applesauce-react/hooks'
import { useCurrentUser, useNostrPublish, useProfile, useAppContext, useUserRelays } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar } from '@/components/UserAvatar'
import { RichTextContent } from '@/components/RichTextContent'
import { CommentInput } from '@/components/CommentInput'
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { formatDistance } from 'date-fns/formatDistance'
import { type NostrEvent } from 'nostr-tools'
import { nowInSecs } from '@/lib/utils'
import { map } from 'rxjs/operators'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { Reply, MoreVertical, Flag, ChevronDown, ChevronUp } from 'lucide-react'
import { CommentReactions } from '@/components/CommentReactions'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { ReportDialog } from '@/components/ReportDialog'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { useTranslation } from 'react-i18next'
import { getDateLocale } from '@/lib/date-locale'
import { useCommentHighlightStore } from '@/stores/commentHighlightStore'

interface Comment {
  id: string
  content: string
  pubkey: string
  created_at: number
  replyToId?: string // The comment this is replying to
  replies?: Comment[] // Nested replies
}

export function CommentSkeleton({ depth = 0 }: { depth?: number }) {
  const isRootComment = depth === 0
  const avatarSize = isRootComment ? 'h-10 w-10' : 'h-6 w-6'

  return (
    <div className="flex gap-3 pb-4">
      <Skeleton className={`${avatarSize} rounded-full shrink-0`} />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-2 mt-2">
          <Skeleton className="h-6 w-14" />
          <Skeleton className="h-6 w-14" />
        </div>
      </div>
    </div>
  )
}

interface VideoCommentsProps {
  videoId: string
  authorPubkey: string
  link: string
  /**
   * Relays to use for loading comments. If not provided, uses app config read relays.
   */
  relays?: string[]
  /**
   * The kind of the video event being commented on (e.g., 34235, 34236)
   */
  videoKind?: number
}

function mapEventToComment(event: NostrEvent, videoId: string): Comment {
  // NIP-22: Find the parent comment ID from lowercase 'e' tag
  // The lowercase 'e' tag points to the parent (the comment being replied to)
  // If it points to the video ID, this is a top-level comment
  const eTags = event.tags.filter(t => t[0] === 'e')
  let replyToId: string | undefined

  // NIP-22: Look for lowercase 'e' tag (parent)
  // There should only be one lowercase 'e' tag in NIP-22
  if (eTags.length > 0) {
    const parentTag = eTags[0]
    const parentId = parentTag[1]

    // If parent is not the video, this is a reply to a comment
    if (parentId !== videoId) {
      replyToId = parentId
    }
    // If parent is the video, this is a top-level comment (replyToId stays undefined)
  }

  return {
    id: event.id,
    content: event.content,
    pubkey: event.pubkey,
    created_at: event.created_at,
    replyToId,
  }
}

// Build threaded comment structure
function buildCommentTree(comments: Comment[]): Comment[] {
  const commentMap = new Map<string, Comment>()
  const rootComments: Comment[] = []

  // First pass: create a map of all comments
  comments.forEach(comment => {
    commentMap.set(comment.id, { ...comment, replies: [] })
  })

  // Second pass: build the tree
  comments.forEach(comment => {
    const commentWithReplies = commentMap.get(comment.id)!

    if (comment.replyToId && commentMap.has(comment.replyToId)) {
      // This is a reply to another comment
      const parent = commentMap.get(comment.replyToId)!
      if (!parent.replies) parent.replies = []
      parent.replies.push(commentWithReplies)
    } else {
      // This is a root-level comment
      rootComments.push(commentWithReplies)
    }
  })

  // Sort root comments by creation date (newest first)
  rootComments.sort((a, b) => b.created_at - a.created_at)

  // Sort replies within each comment (oldest first for threaded conversations)
  const sortReplies = (comment: Comment) => {
    if (comment.replies && comment.replies.length > 0) {
      comment.replies.sort((a, b) => a.created_at - b.created_at)
      comment.replies.forEach(sortReplies)
    }
  }
  rootComments.forEach(sortReplies)

  return rootComments
}

const CommentItem = React.memo(function CommentItem({
  comment,
  link,
  depth = 0,
  onReply,
  replyingTo,
  replyContent,
  onReplyContentChange,
  onSubmitReply,
  onCancelReply,
  expandedComments,
  onToggleExpanded,
  highlightedCommentId,
  currentUserAvatar,
  currentUserName,
  currentUserPubkey,
  onScrollToComment,
}: {
  comment: Comment
  link: string
  depth?: number
  onReply?: (comment: Comment) => void
  replyingTo?: string | null
  replyContent?: string
  onReplyContentChange?: (content: string) => void
  onSubmitReply?: (e: React.FormEvent) => void
  onCancelReply?: () => void
  expandedComments: Set<string>
  onToggleExpanded: (commentId: string) => void
  highlightedCommentId?: string | null
  currentUserAvatar?: string
  currentUserName?: string
  currentUserPubkey?: string
  onScrollToComment?: (commentId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const metadata = useProfile({ pubkey: comment.pubkey })
  const name = metadata?.name || comment.pubkey.slice(0, 8)
  const maxDepth = 5 // Maximum nesting level
  const dateLocale = getDateLocale(i18n.language)
  const isReplying = replyingTo === comment.id
  const isExpanded = expandedComments.has(comment.id)
  const hasReplies = comment.replies && comment.replies.length > 0
  const isHighlighted = highlightedCommentId === comment.id
  const [showReportDialog, setShowReportDialog] = useState(false)

  // Root comments (depth=0) have big avatars, nested have small avatars
  const isRootComment = depth === 0
  const avatarSize = isRootComment ? 'h-10 w-10' : 'h-6 w-6'

  return (
    <div
      id={`comment-${comment.id}`}
      className={`transition-colors duration-500 ${isHighlighted ? 'highlight-comment' : ''}`}
    >
      <div className="flex gap-3 pb-4">
        <UserAvatar
          picture={metadata?.picture}
          pubkey={comment.pubkey}
          name={name}
          className={`${avatarSize} shrink-0`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-sm">{name}</div>
            <div className="text-xs text-muted-foreground">
              {formatDistance(new Date(comment.created_at * 1000), new Date(), {
                addSuffix: true,
                locale: dateLocale,
              })}
            </div>
            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-muted"
                    aria-label="More actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setShowReportDialog(true)}>
                    <Flag className="w-4 h-4 mr-2" />
                    {t('video.comments.reportComment')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <RichTextContent
            content={comment.content}
            videoLink={link}
            className="mt-1 break-all text-sm"
          />
          {/* Reactions, reply, and expand buttons in same row */}
          <div className="flex items-center gap-1 mt-1">
            <CommentReactions eventId={comment.id} authorPubkey={comment.pubkey} />
            {onReply && !isReplying && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onReply(comment)}
              >
                <Reply className="w-3 h-3 mr-1" />
                {t('video.comments.replyButton')}
              </Button>
            )}
            {/* Only show expand/collapse when more than 1 reply */}
            {hasReplies && comment.replies!.length > 1 && depth < maxDepth && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onToggleExpanded(comment.id)}
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-3 h-3 mr-1" />
                    {t('video.comments.hideReplies')} ({comment.replies!.length})
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3 mr-1" />
                    {t('video.comments.showReplies')} ({comment.replies!.length})
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Inline reply form */}
          {isReplying && onSubmitReply && onReplyContentChange && onCancelReply && (
            <div className="mt-3 mb-2">
              <CommentInput
                value={replyContent || ''}
                onChange={onReplyContentChange}
                onSubmit={onSubmitReply}
                onCancel={onCancelReply}
                placeholder={t('video.comments.writeReply')}
                submitLabel={t('video.comments.replyButton')}
                userAvatar={currentUserAvatar}
                userName={currentUserName}
                userPubkey={currentUserPubkey}
                autoFocus
              />
            </div>
          )}

          {/* Render replies: auto-show if only 1 reply, or if expanded for multiple */}
          {hasReplies && (isExpanded || comment.replies!.length === 1) && depth < maxDepth && (
            <div className="mt-2 relative">
              {comment.replies!.map((reply, index) => (
                <div key={reply.id} className="relative flex">
                  {/* Vertical continuation line for all but the last reply */}
                  {index < comment.replies!.length - 1 && (
                    <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
                  )}
                  {/* L-shaped connector from parent to reply */}
                  <div className="absolute left-3 top-0 h-5 w-4 rounded-bl-lg border-l border-b border-border" />
                  <div className="flex-1 pl-6">
                    <CommentItem
                      comment={reply}
                      link={link}
                      depth={depth + 1}
                      onScrollToComment={onScrollToComment}
                      onReply={onReply}
                      replyingTo={replyingTo}
                      replyContent={replyContent}
                      onReplyContentChange={onReplyContentChange}
                      onSubmitReply={onSubmitReply}
                      onCancelReply={onCancelReply}
                      expandedComments={expandedComments}
                      onToggleExpanded={onToggleExpanded}
                      highlightedCommentId={highlightedCommentId}
                      currentUserAvatar={currentUserAvatar}
                      currentUserName={currentUserName}
                      currentUserPubkey={currentUserPubkey}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Show indicator if max depth reached */}
          {hasReplies && depth >= maxDepth && (
            <div className="mt-2 text-xs text-muted-foreground">
              ... {comment.replies!.length} more{' '}
              {comment.replies!.length === 1
                ? t('video.comments.reply')
                : t('video.comments.replies')}
            </div>
          )}
        </div>
      </div>
      <ReportDialog
        open={showReportDialog}
        onOpenChange={setShowReportDialog}
        reportType="comment"
        contentId={comment.id}
        contentAuthor={comment.pubkey}
      />
    </div>
  )
})

export function VideoComments({
  videoId,
  link,
  authorPubkey,
  relays,
  videoKind,
}: VideoCommentsProps) {
  const { t } = useTranslation()
  const [newComment, setNewComment] = useState('')
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [visibleComments, setVisibleComments] = useState(15) // Pagination: show 15 initially
  const eventStore = useEventStore()
  const currentUser = useCurrentUser()
  const { user } = currentUser
  const userProfile = useProfile(user ? { pubkey: user.pubkey } : undefined)
  const { publish } = useNostrPublish()
  const { pool, config } = useAppContext()

  // Use Zustand store for comment highlight/expand state
  const expandedComments = useCommentHighlightStore(state => state.expandedComments)
  const highlightedCommentId = useCommentHighlightStore(state => state.highlightedCommentId)
  const toggleExpanded = useCommentHighlightStore(state => state.toggleExpanded)
  const setHighlightedCommentId = useCommentHighlightStore(state => state.setHighlightedCommentId)
  const setCommentParentMap = useCommentHighlightStore(state => state.setCommentParentMap)
  const clearState = useCommentHighlightStore(state => state.clearState)

  // Ref to track scroll timeout for cleanup
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Scroll to a comment, expanding ancestors first
  const scrollToComment = useCallback(
    (commentId: string) => {
      // Cancel any pending scroll
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }

      // First, expand all ancestors so the comment is visible
      const ancestors = useCommentHighlightStore.getState().getAncestorIds(commentId)
      useCommentHighlightStore.getState().expandComments(ancestors)

      // Wait for DOM update, then scroll
      scrollTimeoutRef.current = setTimeout(() => {
        const element = document.getElementById(`comment-${commentId}`)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          setHighlightedCommentId(commentId)
        }
      }, 100)
    },
    [setHighlightedCommentId]
  )

  // Clear store state and scroll timeout when unmounting (leaving video page)
  useEffect(() => {
    return () => {
      clearState()
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [clearState])

  // Auto-remove highlight after 3 seconds
  useEffect(() => {
    if (!highlightedCommentId) return

    const timer = setTimeout(() => {
      setHighlightedCommentId(null)
    }, 3000)

    return () => clearTimeout(timer)
  }, [highlightedCommentId, setHighlightedCommentId])

  // Get inbox relays for the video author (NIP-65)
  const videoAuthorRelays = useUserRelays(authorPubkey)

  // Get inbox relays for the comment author being replied to
  const replyToAuthorRelays = useUserRelays(replyTo?.pubkey)

  // Get relays where the video event is hosted (from seenRelays)
  const videoEventRelays = useMemo(() => {
    const videoEvent = eventStore.getEvent(videoId)
    if (!videoEvent) return []
    const seenRelays = getSeenRelays(videoEvent)
    return seenRelays ? Array.from(seenRelays) : []
  }, [eventStore, videoId])

  // Use provided relays or fallback to app config read relays
  const readRelays = useMemo(() => {
    if (relays && relays.length > 0) {
      return relays
    }
    return config.relays.filter(r => r.tags.includes('read')).map(r => r.url)
  }, [relays, config.relays])

  const filters = useMemo(
    () => [
      {
        kinds: [1],
        '#e': [videoId],
        limit: 100,
      },
      {
        kinds: [1111],
        '#E': [videoId],
        limit: 100,
      },
    ],
    [videoId]
  )

  // Load comments from relays when filters change
  useEffect(() => {
    const loader = createTimelineLoader(pool, readRelays, filters, {
      limit: 50,
      eventStore,
    })
    const subscription = loader().subscribe(e => eventStore.add(e))

    // Cleanup subscription on unmount or filters change
    return () => subscription.unsubscribe()
  }, [pool, readRelays, filters, eventStore])

  // Use EventStore timeline to get comments for this video
  const flatComments =
    use$(
      () =>
        eventStore
          .timeline(filters)
          .pipe(map(events => events.map(e => mapEventToComment(e, videoId)))),
      [eventStore, filters, videoId]
    ) ?? []

  // Build threaded comment structure
  const threadedComments = useMemo(() => {
    return buildCommentTree(flatComments)
  }, [flatComments])

  // Update comment parent map whenever comments change
  useEffect(() => {
    setCommentParentMap(flatComments)
  }, [flatComments, setCommentParentMap])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newComment.trim()) return

    // Get user's write relays
    const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)

    // Get video author's inbox relays (write relays from their NIP-65 relay list)
    const videoAuthorInbox = videoAuthorRelays.data?.filter(r => r.write).map(r => r.url) || []

    // Combine relays: video event relays + video author's inbox + user's write relays
    // Use Set to remove duplicates
    const targetRelays = Array.from(
      new Set([...videoEventRelays, ...videoAuthorInbox, ...writeRelays])
    )

    // Get a relay hint (use first video event relay or first write relay)
    const relayHint = videoEventRelays[0] || writeRelays[0] || readRelays[0] || ''

    // NIP-22: Top-level comment on a video event
    const tags: string[][] = [
      // Root scope: the video event
      ['E', videoId, relayHint, authorPubkey],
      ['K', String(videoKind || 34235)], // Video event kind
      ['P', authorPubkey, relayHint],

      // Parent (same as root for top-level comments)
      ['e', videoId, relayHint, authorPubkey],
      ['k', String(videoKind || 34235)], // Parent is also the video
      ['p', authorPubkey, relayHint],

      ['client', 'nostube'],
    ]

    const draftEvent = {
      kind: 1111,
      content: newComment,
      created_at: nowInSecs(),
      tags,
    }

    try {
      const signedEvent = await publish({
        event: draftEvent,
        relays: targetRelays,
      })

      // Add the comment to the event store immediately for instant feedback
      eventStore.add(signedEvent)

      setNewComment('')
    } catch (error) {
      console.error('Failed to publish comment:', error)
    }
  }

  const handleReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !replyContent.trim() || !replyTo) return

    // Get user's write relays
    const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)

    // Get comment author's inbox relays (write relays from their NIP-65 relay list)
    const replyToAuthorInbox = replyToAuthorRelays.data?.filter(r => r.write).map(r => r.url) || []

    // Get relays where the parent comment is hosted
    const parentCommentEvent = eventStore.getEvent(replyTo.id)
    const parentCommentRelays = parentCommentEvent
      ? Array.from(getSeenRelays(parentCommentEvent) || [])
      : []

    // Combine relays: parent comment relays + comment author's inbox + user's write relays
    // Use Set to remove duplicates
    const targetRelays = Array.from(
      new Set([...parentCommentRelays, ...replyToAuthorInbox, ...writeRelays])
    )

    // Get a relay hint (use first parent comment relay or first write relay)
    const relayHint = parentCommentRelays[0] || writeRelays[0] || readRelays[0] || ''

    // NIP-22: Reply to a comment
    const tags: string[][] = [
      // Root scope: the video event (always the same for all comments in this thread)
      ['E', videoId, relayHint, authorPubkey],
      ['K', String(videoKind || 34235)], // Video event kind
      ['P', authorPubkey, relayHint],

      // Parent: the comment being replied to
      ['e', replyTo.id, relayHint, replyTo.pubkey],
      ['k', '1111'], // Parent is a comment (kind 1111)
      ['p', replyTo.pubkey, relayHint],

      ['client', 'nostube'],
    ]

    const draftEvent = {
      kind: 1111,
      content: replyContent,
      created_at: nowInSecs(),
      tags,
    }

    try {
      const signedEvent = await publish({
        event: draftEvent,
        relays: targetRelays,
      })

      // Add the comment to the event store immediately for instant feedback
      eventStore.add(signedEvent)

      setReplyContent('')
      setReplyTo(null)
    } catch (error) {
      console.error('Failed to publish reply:', error)
    }
  }

  const handleReply = (comment: Comment) => {
    setReplyTo(comment)
    setReplyContent('')
  }

  const cancelReply = () => {
    setReplyTo(null)
    setReplyContent('')
  }

  // Load more comments
  const loadMoreComments = () => {
    setVisibleComments(prev => prev + 15)
  }

  // Get visible comments for pagination
  const visibleThreadedComments = threadedComments.slice(0, visibleComments)
  const hasMoreComments = threadedComments.length > visibleComments

  // Hide entire section when not logged in and no comments exist
  if (!user && threadedComments.length === 0) {
    return null
  }

  return (
    <div>
      <h2 className="mb-4">
        {threadedComments.length} {t('video.comments.title')}
      </h2>
      {user && (
        <div className="mb-8">
          <CommentInput
            value={newComment}
            onChange={setNewComment}
            onSubmit={handleSubmit}
            userAvatar={userProfile?.picture}
            userName={userProfile?.name || user.pubkey.slice(0, 8)}
            userPubkey={user.pubkey}
          />
        </div>
      )}

      <div>
        {visibleThreadedComments.map(comment => (
          <CommentItem
            key={comment.id}
            comment={comment}
            link={link}
            onScrollToComment={scrollToComment}
            onReply={user ? handleReply : undefined}
            replyingTo={replyTo?.id}
            replyContent={replyContent}
            onReplyContentChange={setReplyContent}
            onSubmitReply={handleReplySubmit}
            onCancelReply={cancelReply}
            expandedComments={expandedComments}
            onToggleExpanded={toggleExpanded}
            highlightedCommentId={highlightedCommentId}
            currentUserAvatar={userProfile?.picture}
            currentUserName={userProfile?.name || user?.pubkey.slice(0, 8)}
            currentUserPubkey={user?.pubkey}
          />
        ))}
      </div>

      {/* Load more button */}
      {hasMoreComments && (
        <div className="mt-4">
          <Button variant="outline" onClick={loadMoreComments} className="w-full">
            {t('video.comments.loadMore')} ({threadedComments.length - visibleComments}{' '}
            {t('video.comments.remaining')})
          </Button>
        </div>
      )}
    </div>
  )
}
