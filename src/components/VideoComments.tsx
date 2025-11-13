import { useEventStore } from 'applesauce-react/hooks'
import { useObservableState } from 'observable-hooks'
import { useCurrentUser, useNostrPublish, useProfile, useAppContext, useUserRelays } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { RichTextContent } from '@/components/RichTextContent'
import React, { useMemo, useState, useEffect, useRef } from 'react'
import { formatDistance } from 'date-fns'
import { type NostrEvent } from 'nostr-tools'
import { imageProxy, nowInSecs } from '@/lib/utils'
import { map } from 'rxjs/operators'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { Reply } from 'lucide-react'
import { getSeenRelays } from 'applesauce-core/helpers/relays'

interface Comment {
  id: string
  content: string
  pubkey: string
  created_at: number
  replyToId?: string // The comment this is replying to
  replies?: Comment[] // Nested replies
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
}) {
  const metadata = useProfile({ pubkey: comment.pubkey })
  const name = metadata?.name || comment.pubkey.slice(0, 8)
  const maxDepth = 5 // Maximum nesting level
  const isReplying = replyingTo === comment.id
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus textarea when replying to this comment
  useEffect(() => {
    if (isReplying && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isReplying])

  return (
    <div className={`mb-4 ${depth > 0 ? 'ml-4' : ''}`}>
      <div className="flex gap-3">
        <Avatar className={depth > 0 ? 'h-8 w-8' : 'h-10 w-10'}>
          <AvatarImage src={imageProxy(metadata?.picture)} />
          <AvatarFallback>{name[0]}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-sm">{name}</div>
            <div className="text-xs text-muted-foreground">
              {formatDistance(new Date(comment.created_at * 1000), new Date(), {
                addSuffix: true,
              })}
            </div>
          </div>
          <RichTextContent
            content={comment.content}
            videoLink={link}
            className="mt-1 wrap-break-word text-sm"
          />
          {onReply && !isReplying && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 h-7 px-2 text-xs"
              onClick={() => onReply(comment)}
            >
              <Reply className="w-3 h-3 mr-1" />
              Reply
            </Button>
          )}

          {/* Inline reply form */}
          {isReplying && onSubmitReply && onReplyContentChange && onCancelReply && (
            <form onSubmit={onSubmitReply} className="mt-3 mb-2">
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  value={replyContent || ''}
                  onChange={e => onReplyContentChange(e.target.value)}
                  placeholder="Write a reply..."
                  className="resize-none border-0 border-b-2 border-input rounded-none px-0 py-2 focus-visible:ring-0 focus-visible:border-primary transition-colors min-h-10"
                  rows={1}
                  onKeyDown={e => {
                    // Submit on Ctrl/Cmd + Enter
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      onSubmitReply(e)
                    }
                    // Cancel on Escape
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      onCancelReply()
                    }
                  }}
                />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Button type="submit" disabled={!replyContent?.trim()} size="sm">
                  Reply
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={onCancelReply}>
                  Cancel
                </Button>
                <span className="text-xs text-muted-foreground">
                  Ctrl+Enter to submit, Esc to cancel
                </span>
              </div>
            </form>
          )}

          {/* Render nested replies */}
          {comment.replies && comment.replies.length > 0 && depth < maxDepth && (
            <div className="mt-3">
              {comment.replies.map(reply => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  link={link}
                  depth={depth + 1}
                  onReply={onReply}
                  replyingTo={replyingTo}
                  replyContent={replyContent}
                  onReplyContentChange={onReplyContentChange}
                  onSubmitReply={onSubmitReply}
                  onCancelReply={onCancelReply}
                />
              ))}
            </div>
          )}
          {/* Show indicator if max depth reached */}
          {comment.replies && comment.replies.length > 0 && depth >= maxDepth && (
            <div className="mt-2 text-xs text-muted-foreground">
              ... {comment.replies.length} more {comment.replies.length === 1 ? 'reply' : 'replies'}
            </div>
          )}
        </div>
      </div>
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
  const [newComment, setNewComment] = useState('')
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const eventStore = useEventStore()
  const { user } = useCurrentUser()
  const { publish } = useNostrPublish()
  const { pool, config } = useAppContext()

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
      timeout: 5000, // 5 second timeout per relay to prevent blocking
    })
    const subscription = loader().subscribe(e => eventStore.add(e))

    // Cleanup subscription on unmount or filters change
    return () => subscription.unsubscribe()
  }, [pool, readRelays, filters, eventStore])

  // Use EventStore timeline to get comments for this video
  const comments$ = useMemo(() => {
    return eventStore
      .timeline(filters)
      .pipe(map(events => events.map(e => mapEventToComment(e, videoId))))
  }, [eventStore, filters, videoId])

  const flatComments = useObservableState(comments$, [])

  // Build threaded comment structure
  const threadedComments = useMemo(() => {
    return buildCommentTree(flatComments)
  }, [flatComments])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newComment.trim()) return

    // Get user's write relays
    const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)

    // Get video author's inbox relays (write relays from their NIP-65 relay list)
    const videoAuthorInbox = videoAuthorRelays.data
      ?.filter(r => r.write)
      .map(r => r.url) || []

    // Combine relays: video event relays + video author's inbox + user's write relays
    // Use Set to remove duplicates
    const targetRelays = Array.from(new Set([
      ...videoEventRelays,
      ...videoAuthorInbox,
      ...writeRelays,
    ]))

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
    const replyToAuthorInbox = replyToAuthorRelays.data
      ?.filter(r => r.write)
      .map(r => r.url) || []

    // Get relays where the parent comment is hosted
    const parentCommentEvent = eventStore.getEvent(replyTo.id)
    const parentCommentRelays = parentCommentEvent
      ? Array.from(getSeenRelays(parentCommentEvent) || [])
      : []

    // Combine relays: parent comment relays + comment author's inbox + user's write relays
    // Use Set to remove duplicates
    const targetRelays = Array.from(new Set([
      ...parentCommentRelays,
      ...replyToAuthorInbox,
      ...writeRelays,
    ]))

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

  // Hide entire section when not logged in and no comments exist
  if (!user && threadedComments.length === 0) {
    return null
  }

  return (
    <div className="px-2 sm:px-0">
      <h2 className="mb-4">Comments</h2>
      {user && (
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="resize-none border-0 border-b-2 border-input rounded-none px-0 py-2 focus-visible:ring-0 focus-visible:border-primary transition-colors min-h-10"
              rows={1}
              onKeyDown={e => {
                // Submit on Ctrl/Cmd + Enter
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
            />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Button type="submit" disabled={!newComment.trim()} size="sm">
              Comment
            </Button>
            <span className="text-xs text-muted-foreground">Ctrl+Enter to submit</span>
          </div>
        </form>
      )}

      <div>
        {threadedComments.map(comment => (
          <CommentItem
            key={comment.id}
            comment={comment}
            link={link}
            onReply={user ? handleReply : undefined}
            replyingTo={replyTo?.id}
            replyContent={replyContent}
            onReplyContentChange={setReplyContent}
            onSubmitReply={handleReplySubmit}
            onCancelReply={cancelReply}
          />
        ))}
      </div>
    </div>
  )
}
