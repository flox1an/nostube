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
import type { Filter } from 'nostr-tools'
import { useCurrentUser, useNostrPublish, useProfile, useAppContext, useUserRelays } from '@/hooks'
import { Button } from '@/components/ui/button'
import { CommentInput } from '@/components/CommentInput'
import { nowInSecs } from '@/lib/utils'
import { useCommentHighlightStore } from '@/stores/commentHighlightStore'
import { getReplacedEventIds } from '@/lib/replaced-events'
import type { Comment, VideoCommentsProps } from './types'
import { mapEventToComment, buildCommentTree } from './utils'
import { CommentItem } from './CommentItem'

export function VideoComments({
  videoId,
  link,
  authorPubkey,
  relays,
  videoKind,
  identifier,
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

  // Build address for addressable events (kinds 34235, 34236)
  // Address format: <kind>:<pubkey>:<d-tag>
  const isAddressable = videoKind === 34235 || videoKind === 34236
  const videoAddress = useMemo(() => {
    if (isAddressable && identifier) {
      return `${videoKind}:${authorPubkey}:${identifier}`
    }
    return null
  }, [isAddressable, videoKind, authorPubkey, identifier])

  // Build filters to query comments
  // For addressable events: query by both address (#A/#a) and event ID (#E/#e) for compatibility
  // For regular events: query by event ID only
  // Also include old event IDs for kind 1 comments that reference previous versions
  const filters = useMemo(() => {
    // Collect all known event IDs (current + old replaced ones)
    const allEventIds = [videoId]
    if (videoAddress) {
      const oldIds = getReplacedEventIds(videoAddress)
      for (const id of oldIds) {
        if (!allEventIds.includes(id)) allEventIds.push(id)
      }
    }

    // Query by event ID (for backwards compatibility and non-addressable events)
    const baseFilters = [
      { kinds: [1], '#e': allEventIds, limit: 100 },
      { kinds: [1111], '#E': allEventIds, limit: 100 },
    ] as Filter[]

    // For addressable events, also query by address
    if (videoAddress) {
      baseFilters.push(
        { kinds: [1], '#a': [videoAddress], limit: 100 } as Filter,
        { kinds: [1111], '#A': [videoAddress], limit: 100 } as Filter
      )
    }

    return baseFilters
  }, [videoId, videoAddress])

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
          .pipe(
            map(events => events.map(e => mapEventToComment(e, videoId, videoAddress ?? undefined)))
          ),
      [eventStore, filters, videoId, videoAddress]
    ) ?? []

  // Second pass: fetch replies to known comments from external clients
  // External clients may only tag the parent comment (not the video), so we
  // query for kind:1 events referencing any known comment ID via #e.
  const commentIds = useMemo(
    () =>
      flatComments
        .map(c => c.id)
        .sort()
        .join(','),
    [flatComments]
  )
  useEffect(() => {
    if (!commentIds) return
    const ids = commentIds.split(',')
    const replyFilters: Filter[] = [{ kinds: [1], '#e': ids, limit: 100 }]
    const loader = createTimelineLoader(pool, readRelays, replyFilters, {
      limit: 50,
      eventStore,
    })
    const subscription = loader().subscribe(e => eventStore.add(e))
    return () => subscription.unsubscribe()
  }, [pool, readRelays, commentIds, eventStore])

  // Combined filters for the EventStore observable (includes reply filters)
  const allFilters = useMemo(() => {
    if (!flatComments.length) return filters
    const ids = flatComments.map(c => c.id)
    return [...filters, { kinds: [1], '#e': ids, limit: 100 } as Filter]
  }, [filters, flatComments])

  // Re-derive comments including replies found by the second pass
  const allComments =
    use$(
      () =>
        eventStore
          .timeline(allFilters)
          .pipe(
            map(events => events.map(e => mapEventToComment(e, videoId, videoAddress ?? undefined)))
          ),
      [eventStore, allFilters, videoId, videoAddress]
    ) ?? flatComments

  // Build threaded comment structure
  const threadedComments = useMemo(() => {
    return buildCommentTree(allComments)
  }, [allComments])

  // Update comment parent map whenever comments change
  useEffect(() => {
    setCommentParentMap(allComments)
  }, [allComments, setCommentParentMap])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !newComment.trim()) return

    // Get user's write relays
    const writeRelays = config.relays.filter(r => r.tags.includes('write')).map(r => r.url)

    // Get video author's inbox relays (NIP-65: use both write and read relays for mentions)
    // Write relays = where author publishes (inbox)
    // Read relays = where author checks for mentions
    const videoAuthorInbox =
      videoAuthorRelays.data?.filter(r => r.write || r.read).map(r => r.url) || []

    // Combine relays: video event relays + video author's inbox + user's write relays
    // Use Set to remove duplicates
    const targetRelays = Array.from(
      new Set([...videoEventRelays, ...videoAuthorInbox, ...writeRelays])
    )

    // Get a relay hint (use first video event relay or first write relay)
    const relayHint = videoEventRelays[0] || writeRelays[0] || readRelays[0] || ''

    // NIP-22: Top-level comment on a video event
    // For addressable events (kinds 34235, 34236), use A/a tags with address format
    // For regular events (kinds 21, 22), use E/e tags with event ID
    const tags: string[][] = []

    if (isAddressable && videoAddress) {
      // Addressable event: use A/a tags with address, plus e tag for current event ID
      tags.push(
        // Root scope: the video address
        ['A', videoAddress, relayHint],
        ['K', String(videoKind)],
        ['P', authorPubkey, relayHint],
        // Parent (same as root for top-level comments) - use both address and event ID
        ['a', videoAddress, relayHint],
        ['e', videoId, relayHint], // Include event ID for compatibility
        ['k', String(videoKind)],
        ['p', authorPubkey, relayHint]
      )
    } else {
      // Regular event: use E/e tags with event ID
      tags.push(
        ['E', videoId, relayHint, authorPubkey],
        ['K', String(videoKind || 34235)],
        ['P', authorPubkey, relayHint],
        ['e', videoId, relayHint, authorPubkey],
        ['k', String(videoKind || 34235)],
        ['p', authorPubkey, relayHint]
      )
    }

    tags.push(['client', 'nostube'])

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

    // Get comment author's inbox relays (NIP-65: use both write and read relays for mentions)
    // Write relays = where author publishes (inbox)
    // Read relays = where author checks for mentions
    const replyToAuthorInbox =
      replyToAuthorRelays.data?.filter(r => r.write || r.read).map(r => r.url) || []

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

    // Determine reply kind based on parent:
    // - Replying to kind 1 → use kind 1 with NIP-10 threading (spec: "Comments MUST NOT reply to kind 1")
    // - Replying to kind 1111 → use kind 1111 with NIP-22 tags
    const isReplyToKind1 = replyTo.kind === 1

    const tags: string[][] = []
    let replyKind: number

    if (isReplyToKind1) {
      // NIP-10: Reply to a kind 1 note using kind 1 threading
      // Root tag = the video event, Reply tag = the comment being replied to
      replyKind = 1
      tags.push(
        ['e', videoId, relayHint, 'root'],
        ['e', replyTo.id, relayHint, 'reply'],
        ['p', authorPubkey, relayHint],
        ['p', replyTo.pubkey, relayHint],
        ['client', 'nostube']
      )
    } else {
      // NIP-22: Reply to a kind 1111 comment
      // Root scope uses A tag for addressable events, E tag for regular events
      replyKind = 1111

      if (isAddressable && videoAddress) {
        tags.push(
          ['A', videoAddress, relayHint],
          ['K', String(videoKind)],
          ['P', authorPubkey, relayHint]
        )
      } else {
        tags.push(
          ['E', videoId, relayHint, authorPubkey],
          ['K', String(videoKind || 34235)],
          ['P', authorPubkey, relayHint]
        )
      }

      // Parent: the comment being replied to
      tags.push(
        ['e', replyTo.id, relayHint, replyTo.pubkey],
        ['k', '1111'],
        ['p', replyTo.pubkey, relayHint],
        ['client', 'nostube']
      )
    }

    const draftEvent = {
      kind: replyKind,
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
            videoAuthorPubkey={authorPubkey}
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
