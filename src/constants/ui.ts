/**
 * UI-related constants for dimensions, breakpoints, and limits.
 */

// Breakpoints (should match Tailwind config)
export const BREAKPOINT_SM = 640
export const BREAKPOINT_MD = 768
export const BREAKPOINT_LG = 1024
export const BREAKPOINT_XL = 1280
export const BREAKPOINT_2XL = 1536

// Video grid columns
export const GRID_COLS_HORIZONTAL = {
  default: 1,
  md: 2,
  lg: 3,
  xl: 4,
  '2xl': 6,
}

export const GRID_COLS_VERTICAL = {
  default: 2,
  md: 3,
  lg: 4,
  xl: 6,
  '2xl': 8,
}

// Skeleton counts
export const SKELETON_COUNT_DEFAULT = 24
export const SKELETON_ROWS_LOADING = 2

// Input limits
export const MAX_COMMENT_LENGTH = 140
export const MAX_VIDEO_TITLE_LENGTH = 200
export const MAX_VIDEO_DESCRIPTION_LENGTH = 5000
export const MAX_TAGS_COUNT = 20

// Pagination
export const PAGE_SIZE_DEFAULT = 20
export const PAGE_SIZE_SHORTS = 30

// Avatar sizes
export const AVATAR_SIZE_SM = 24
export const AVATAR_SIZE_MD = 40
export const AVATAR_SIZE_LG = 64

// Zap presets
export const ZAP_PRESET_AMOUNTS = [21, 100, 500, 1000, 5000] as const
