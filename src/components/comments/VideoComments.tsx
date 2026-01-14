/**
 * Video Comments Component
 *
 * Main container for loading and displaying threaded comments on videos.
 * Handles comment creation, reply threading, and NIP-22/NIP-65 relay targeting.
 */

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { useEventStore, use$ } from 'applesauce-react/hooks'
import { useTranslation } from 'react-i18next'
import { map } from 'rxjs/operators'
import { createTimelineLoader } from 'applesauce-loaders/loaders'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { useCurrentUser, useNostrPublish, useProfile, useAppContext, useUserRelays } from '@/hooks'
import { Button } from '@/components/ui/button'
import { CommentInput } from '@/components/CommentInput'
import { nowInSecs } from '@/lib/utils'
import { useCommentHighlightStore } from '@/stores/commentHighlightStore'
import type { Comment, VideoCommentsProps } from './types'
import { mapEventToComment, buildCommentTree } from './utils'
import { CommentItem } from './CommentItem'

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
