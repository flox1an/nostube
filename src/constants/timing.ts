/**
 * Timing constants for animations, delays, and timeouts.
 */

// Toast notifications
export const TOAST_REMOVE_DELAY = 1000000 // ms - effectively keeps toast visible until dismissed

// Animation durations (in ms)
export const ANIMATION_FAST = 150
export const ANIMATION_NORMAL = 300
export const ANIMATION_SLOW = 500

// Debounce delays
export const DEBOUNCE_SEARCH = 300
export const DEBOUNCE_RESIZE = 100

// Video player
export const VIDEO_STALL_TIMEOUT = 5000 // ms - detect stalled video loading
export const VIDEO_SEEK_AMOUNT = 10 // seconds for keyboard shortcuts (J/L)
export const VIDEO_FAST_SEEK_AMOUNT = 5 // seconds for arrow keys

// Polling intervals
export const NOTIFICATION_POLL_INTERVAL = 60000 // 1 minute
export const RELAY_RECONNECT_DELAY = 3000

// Expiration
export const NOTIFICATION_RETENTION_DAYS = 7
