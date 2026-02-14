/**
 * Video Comments
 *
 * Re-exports from the modularized comments/ directory.
 * This file exists for backward compatibility with existing imports.
 */

export {
  VideoComments,
  CommentItem,
  CommentSkeleton,
} from './comments'
export { mapEventToComment, buildCommentTree } from './comments/utils'
export type {
  Comment,
  VideoCommentsProps,
  CommentItemProps,
} from './comments'
