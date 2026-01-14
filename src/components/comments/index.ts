/**
 * Video Comments Module
 *
 * Re-exports comment components for clean imports.
 */

export { VideoComments } from './VideoComments'
export { CommentItem, type CommentItemProps } from './CommentItem'
export { CommentSkeleton } from './CommentSkeleton'
export { mapEventToComment, buildCommentTree } from './utils'
export type { Comment, VideoCommentsProps } from './types'
