import { getInstanceConfig } from '@nostube/core/instance-config'

/** Shared bits of the author page family (page + carved modules). */

// Instance build: no hosted avatar generator (api.dicebear.com); components fall back to
// their character/initial fallback instead of a remote URL.
export const avatarFallbackUrl = (pubkey: string) =>
  getInstanceConfig() ? undefined : `https://api.dicebear.com/7.x/avataaars/svg?seed=${pubkey}`

/** 44px touch target for h-9 controls without growing them visually. */
export const TAP_TARGET = 'relative after:absolute after:inset-x-0 after:-inset-y-1'
/** Shelf row: bleeds to the screen edge on mobile so the next card peeks; thumbnails start at 16px. */
export const SHELF_SCROLLER = '-mx-4 overflow-x-auto scrollbar-hide px-3 sm:mx-0 sm:px-0'

export type Tabs = 'overview' | 'videos' | 'shorts' | 'playlists' | 'liked' | 'following'
export const AUTHOR_TABS: Tabs[] = [
  'overview',
  'videos',
  'shorts',
  'playlists',
  'liked',
  'following',
]

export function isAuthorTab(tab: string | undefined): tab is Tabs {
  return !!tab && AUTHOR_TABS.includes(tab as Tabs)
}
