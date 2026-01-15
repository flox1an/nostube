/**
 * Video Comments Types
 *
 * Shared types for the comment components.
 */

/**
 * Comment structure with threading support
 */
export interface Comment {
  id: string
  content: string
  pubkey: string
  created_at: number
  replyToId?: string // The comment this is replying to
  replies?: Comment[] // Nested replies
}

/**
 * Props for the VideoComments component
 */
export interface VideoCommentsProps {
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
  /**
   * The d-tag (identifier) for addressable events (kinds 34235, 34236).
   * Required for proper NIP-22 comment linking that persists across edits.
   */
  identifier?: string
}
