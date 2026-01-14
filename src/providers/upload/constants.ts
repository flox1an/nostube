/**
 * Upload Manager Constants
 *
 * DVM kinds, timeouts, and other configuration values.
 */

// DVM (Data Vending Machine) event kinds
export const DVM_REQUEST_KIND = 5207
export const DVM_RESULT_KIND = 6207
export const DVM_FEEDBACK_KIND = 7000
export const HANDLER_INFO_KIND = 31990

// 12 hour timeout for resumable jobs
export const TRANSCODE_JOB_TIMEOUT_MS = 12 * 60 * 60 * 1000

// DVM discovery timeout
export const DVM_DISCOVERY_TIMEOUT_MS = 10000

// DVM job timeout (10 minutes per resolution)
export const DVM_JOB_TIMEOUT_MS = 10 * 60 * 1000

// Query timeout for existing results
export const QUERY_RESULT_TIMEOUT_MS = 5000

// Nostr sync debounce delay
export const NOSTR_SYNC_DEBOUNCE_MS = 5000

// Active task statuses
export const ACTIVE_TASK_STATUSES = ['pending', 'uploading', 'mirroring', 'transcoding'] as const
