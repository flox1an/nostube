/**
 * Nostube Preset Types
 *
 * Presets are stored as kind 30078 events with d="nostube-presets"
 * Each user can publish their own preset, and users can select which preset to use
 */

/**
 * The JSON content stored in the event
 */
export interface NostubePresetContent {
  defaultRelays: string[]
  defaultBlossomProxy?: string
  defaultThumbResizeServer?: string
  blockedPubkeys: string[]
  nsfwPubkeys: string[]
  blockedEvents: string[]
}

/**
 * Full preset with metadata from event tags
 */
export interface NostubePreset extends NostubePresetContent {
  name: string
  description?: string
  pubkey: string // owner's pubkey (hex)
  createdAt: number
}

/**
 * Default preset pubkey - used when no preset is selected
 */
export const DEFAULT_PRESET_PUBKEY =
  'b7c6f6915cfa9a62fff6a1f02604de88c23c6c6c6d1b8f62c7cc10749f307e81'

/**
 * Event kind for app-specific data (NIP-78)
 */
export const PRESET_EVENT_KIND = 30078

/**
 * D-tag value for nostube presets
 */
export const PRESET_D_TAG = 'nostube-presets'

/**
 * Empty preset for fallback
 */
export const EMPTY_PRESET_CONTENT: NostubePresetContent = {
  defaultRelays: [],
  defaultBlossomProxy: undefined,
  defaultThumbResizeServer: undefined,
  blockedPubkeys: [],
  nsfwPubkeys: [],
  blockedEvents: [],
}
