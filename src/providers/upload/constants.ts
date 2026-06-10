/**
 * Upload Manager Constants
 *
 * Non-DVM configuration values.
 * DVM event kinds and timeouts live in src/lib/dvm-transcode-session.ts.
 */

// Nostr sync debounce delay
export const NOSTR_SYNC_DEBOUNCE_MS = 5000

// Active task statuses
export const ACTIVE_TASK_STATUSES = ['pending', 'uploading', 'mirroring', 'transcoding'] as const
