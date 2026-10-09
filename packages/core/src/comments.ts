/**
 * Video comments: the protocol layer shared by the web app and server instances' sites —
 * mapping events to comments, threading, the NIP-22/NIP-10 queries and the tag shapes for
 * publishing comments, replies and deletions.
 */

import type { Filter, NostrEvent } from 'nostr-tools'

/**
 * Comment structure with threading support
 */
export interface Comment {
  id: string
  content: string
  pubkey: string
  created_at: number
  kind: number // The event kind (1 or 1111)
  replyToId?: string // The comment this is replying to
  replies?: Comment[] // Nested replies
}

/** Everything identifying the video being commented on. */
export interface CommentTarget {
  videoId: string
  authorPubkey: string
  /** The kind of the video event (e.g. 21, 22, 34235, 34236). */
  videoKind?: number
  /** The d-tag of addressable videos (kinds 34235/34236). */
  identifier?: string
}

/** What a comments UI needs to load and publish comments for one video. */
export interface VideoCommentsProps extends CommentTarget {
  /** The page URL of the video, for linkified mentions in comments. */
  link: string
  /**
   * Relays to load comments from. Omit to use the host's read relays.
   */
  relays?: string[]
}

/** Addressable video kinds link comments via a `kind:pubkey:d` coordinate (NIP-71). */
export function isAddressableVideo(videoKind?: number): boolean {
  return videoKind === 34235 || videoKind === 34236
}

/** `<kind>:<pubkey>:<d-tag>` for addressable videos, else null. */
export function videoAddressOf(target: CommentTarget): string | null {
  if (isAddressableVideo(target.videoKind) && target.identifier) {
    return `${target.videoKind}:${target.authorPubkey}:${target.identifier}`
  }
  return null
}

/**
 * Map a Nostr event to a Comment structure.
 *
 * Supports two tagging conventions:
 * - Kind 1111 (NIP-22): lowercase 'e' tag = parent reference, uppercase 'E'/'A' = root scope
 * - Kind 1 (NIP-10): multiple 'e' tags with markers in position [3]: 'root' = video, 'reply' = parent comment
 *
 * @param event - The Nostr event to map
 * @param videoId - The event ID of the video
 * @param videoAddress - The address of the video (for addressable events: kind:pubkey:d-tag)
 */
export function mapEventToComment(
  event: NostrEvent,
  videoId: string,
  videoAddress?: string
): Comment {
  const eTags = event.tags.filter(t => t[0] === 'e')
  const aTags = event.tags.filter(t => t[0] === 'a')
  let replyToId: string | undefined

  if (event.kind === 1) {
    // NIP-10 threading for kind 1 events:
    // e tags can have markers in position [3]: "root", "reply", "mention"
    // "reply" marker = the comment being replied to (parent)
    // "root" marker = the original post (the video)
    // If no markers, fall back to positional: last e tag = reply, first = root
    const replyTag = eTags.find(t => t[3] === 'reply')
    const rootTag = eTags.find(t => t[3] === 'root')

    if (replyTag) {
      // Has explicit reply marker — this is a reply to another comment
      const parentId = replyTag[1]
      if (parentId !== videoId) {
        replyToId = parentId
      }
    } else if (rootTag) {
      // Has root but no reply — top-level comment on the video
      // replyToId stays undefined
    } else if (eTags.length > 1) {
      // No markers (deprecated positional scheme):
      // first e tag = root, last e tag = reply
      const lastTag = eTags[eTags.length - 1]
      if (lastTag[1] !== videoId) {
        replyToId = lastTag[1]
      }
    }
    // Single e tag with no markers = top-level comment
  } else {
    // Kind 1111 (NIP-22): lowercase 'e' tag is the parent reference
    // If it points to the video ID, it's top-level
    if (eTags.length > 0) {
      const parentTag = eTags[0]
      const parentId = parentTag[1]

      if (parentId === videoId) {
        // Top-level comment (replyToId stays undefined)
      } else if (videoAddress && aTags.length > 0) {
        const aTag = aTags[0]
        if (aTag[1] === videoAddress) {
          // 'a' tag points to video, 'e' tag points to parent comment
          replyToId = parentId
        } else {
          replyToId = parentId
        }
      } else {
        replyToId = parentId
      }
    } else if (videoAddress && aTags.length > 0) {
      const aTag = aTags[0]
      if (aTag[1] === videoAddress) {
        // Top-level comment on addressable event (replyToId stays undefined)
      }
    }
  }

  return {
    id: event.id,
    content: event.content,
    pubkey: event.pubkey,
    created_at: event.created_at,
    kind: event.kind,
    replyToId,
  }
}

/**
 * Build threaded comment structure from flat list.
 * Returns root comments with nested replies sorted appropriately.
 */
export function buildCommentTree(comments: Comment[]): Comment[] {
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

/**
 * The relay queries that find every comment on a video: kind 1 (legacy NIP-10) and kind 1111
 * (NIP-22) referencing the current event id, plus the address for addressable videos and any
 * older video event ids that existing comments may still reference.
 */
export function buildCommentFilters(target: CommentTarget, olderVideoIds: string[] = []): Filter[] {
  const allEventIds = [target.videoId, ...olderVideoIds]
  const baseFilters = [
    { kinds: [1], '#e': allEventIds, limit: 100 },
    { kinds: [1111], '#E': allEventIds, limit: 100 },
  ] as Filter[]

  const videoAddress = videoAddressOf(target)
  if (videoAddress) {
    baseFilters.push(
      { kinds: [1], '#a': [videoAddress], limit: 100 } as Filter,
      { kinds: [1111], '#A': [videoAddress], limit: 100 } as Filter
    )
  }

  return baseFilters
}

/**
 * Tags of a top-level comment: root scope and parent are the video itself (NIP-22). Regular
 * event roots use E/e with the event id, addressable ones A/a with the coordinate plus the
 * current id as compatibility e reference.
 */
export function buildTopLevelCommentTags(target: CommentTarget, relayHint: string): string[][] {
  const videoAddress = videoAddressOf(target)
  const kind = String(target.videoKind ?? 34235)

  if (videoAddress) {
    return [
      ['A', videoAddress, relayHint],
      ['K', kind],
      ['P', target.authorPubkey, relayHint],
      ['a', videoAddress, relayHint],
      ['e', target.videoId, relayHint],
      ['k', kind],
      ['p', target.authorPubkey, relayHint],
    ]
  }
  return [
    ['E', target.videoId, relayHint, target.authorPubkey],
    ['K', kind],
    ['P', target.authorPubkey, relayHint],
    ['e', target.videoId, relayHint, target.authorPubkey],
    ['k', kind],
    ['p', target.authorPubkey, relayHint],
  ]
}

/**
 * Tags of a reply to a NIP-22 comment: the root scope still points at the video, the parent
 * scope at the comment being replied to.
 */
export function buildCommentReplyTags(
  target: CommentTarget,
  parent: { id: string; pubkey: string },
  relayHint: string
): string[][] {
  const videoAddress = videoAddressOf(target)
  const rootTags = videoAddress
    ? [
        ['A', videoAddress, relayHint],
        ['K', String(target.videoKind)],
        ['P', target.authorPubkey, relayHint],
      ]
    : [
        ['E', target.videoId, relayHint, target.authorPubkey],
        ['K', String(target.videoKind ?? 34235)],
        ['P', target.authorPubkey, relayHint],
      ]

  return [
    ...rootTags,
    ['e', parent.id, relayHint, parent.pubkey],
    ['k', '1111'],
    ['p', parent.pubkey, relayHint],
  ]
}

/**
 * Tags of a legacy NIP-10 reply to a kind-1 comment: root marker on the video, reply marker
 * on the parent comment.
 */
export function buildLegacyReplyTags(
  target: CommentTarget,
  parent: { id: string; pubkey: string },
  relayHint: string
): string[][] {
  return [
    ['e', target.videoId, relayHint, 'root'],
    ['e', parent.id, relayHint, 'reply'],
    ['p', target.authorPubkey, relayHint],
    ['p', parent.pubkey, relayHint],
  ]
}

/** Tags of a NIP-09 deletion of one's own comment. */
export function buildCommentDeletionTags(commentId: string, commentKind: number): string[][] {
  return [
    ['e', commentId],
    ['k', String(commentKind)],
  ]
}
