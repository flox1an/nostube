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
  'b7c6f691cf8a9a65ffd6a1f02c0368d18c3c6d8d8d6e3d62c7cc8093e7307e80' // npub1klr0dy2ul2dx9llk58czvpx73rprcmrvd5dc7ck8esg8f8es06qs427gxc

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
  blockedPubkeys: [],
  nsfwPubkeys: [],
  blockedEvents: [],
}
