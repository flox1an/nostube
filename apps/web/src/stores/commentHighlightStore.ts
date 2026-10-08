import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'

// Enable Immer support for Map and Set
enableMapSet()

interface Comment {
  id: string
  replyToId?: string
}

interface CommentHighlightState {
  // Set of expanded comment IDs
  expandedComments: Set<string>
  // Currently highlighted comment ID
  highlightedCommentId: string | null
  // Map of comment ID to parent comment ID (for finding ancestors)
  commentParentMap: Map<string, string>
}

interface CommentHighlightActions {
  // Toggle a comment's expanded state
  toggleExpanded: (commentId: string) => void
  // Expand specific comments (for auto-expanding parents)
  expandComments: (commentIds: string[]) => void
  // Set highlighted comment
  setHighlightedCommentId: (commentId: string | null) => void
  // Update the comment parent map
  setCommentParentMap: (comments: Comment[]) => void
  // Get all ancestor IDs for a comment
  getAncestorIds: (commentId: string) => string[]
  // Clear all state (when leaving video page)
  clearState: () => void
}

type CommentHighlightStore = CommentHighlightState & CommentHighlightActions

export const useCommentHighlightStore = create<CommentHighlightStore>()(
  immer((set, get) => ({
    expandedComments: new Set<string>(),
    highlightedCommentId: null,
    commentParentMap: new Map<string, string>(),

    toggleExpanded: (commentId: string) => {
      set(state => {
        if (state.expandedComments.has(commentId)) {
          state.expandedComments.delete(commentId)
        } else {
          state.expandedComments.add(commentId)
        }
      })
    },

    expandComments: (commentIds: string[]) => {
      set(state => {
        commentIds.forEach(id => state.expandedComments.add(id))
      })
    },

    setHighlightedCommentId: (commentId: string | null) => {
      set(state => {
        state.highlightedCommentId = commentId
      })
    },

    setCommentParentMap: (comments: Comment[]) => {
      set(state => {
        const map = new Map<string, string>()
        comments.forEach(comment => {
          if (comment.replyToId) {
            map.set(comment.id, comment.replyToId)
          }
        })
        state.commentParentMap = map
      })
    },

    getAncestorIds: (commentId: string) => {
      const state = get()
      const ancestors: string[] = []
      let currentId: string | undefined = commentId

      // Walk up the parent chain
      while (currentId) {
        const parentId = state.commentParentMap.get(currentId)
        if (parentId) {
          ancestors.push(parentId)
          currentId = parentId
        } else {
          break
        }
      }

      return ancestors
    },

    clearState: () => {
      set(state => {
        state.expandedComments = new Set()
        state.highlightedCommentId = null
        state.commentParentMap = new Map()
      })
    },
  }))
)
