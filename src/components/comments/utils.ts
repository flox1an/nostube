/**
 * Video Comments Utilities
 *
 * Helper functions for mapping events to comments and building comment trees.
 */

import type { NostrEvent } from 'nostr-tools'
import type { Comment } from './types'

/**
 * Map a Nostr event to a Comment structure.
 * Handles NIP-22 comment format with lowercase 'e' tags for parent reference.
 */
export function mapEventToComment(event: NostrEvent, videoId: string): Comment {
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
