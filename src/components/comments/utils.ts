/**
 * Video Comments Utilities
 *
 * Helper functions for mapping events to comments and building comment trees.
 */

import type { NostrEvent } from 'nostr-tools'
import type { Comment } from './types'

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
