/**
 * Hooks barrel export - organized by domain for easier discovery.
 *
 * Usage: import { useCurrentUser, useProfile } from '@/hooks'
 */

// ============================================================================
// ACCOUNT PERSISTENCE (utilities, not hooks)
// ============================================================================
export {
  saveActiveAccount,
  removeAccountFromStorage,
} from '@nostube/widgets/hooks/useAccountPersistence'

// ============================================================================
// AUTH & USER
// ============================================================================
export { useCurrentUser } from './useCurrentUser'

// ============================================================================
// PROFILE & SOCIAL
// ============================================================================
export { useProfile } from '@nostube/widgets/hooks/useProfile'
export { useHasProfile } from './useHasProfile'
export { useProfilePublish } from './useProfilePublish'
export { useMutedPubkeys } from './useMutedPubkeys'
export { useMuteUser } from './useMuteUser'
export { useSubscriptionsVideos } from './useSubscriptionsVideos'
export { useFollowSet } from './useFollowSet'
export { useAuthorFollowing } from './useAuthorFollowing'
export { useLikedEvents } from './useLikedEvents'
export { useAuthorLikedVideos } from './useAuthorLikedVideos'
export { useCommentCount } from './useCommentCount'
export { useBlockedPubkeys, useReportedPubkeys } from './useReportedPubkeys'

// ============================================================================
// VIDEO PLAYBACK & PLAYER
// ============================================================================

export { useVideoPlayPosition } from './useVideoPlayPosition'
export { useVideoKeyboardShortcuts } from './useVideoKeyboardShortcuts'
export { useVideoHistory } from './useVideoHistory'

export { useVideoViewTracking } from './useVideoViewTracking'
export { useViewEventSweeper } from './useViewEventSweeper'

export { useContinueWatching } from './useContinueWatching'
export { useUltraWideVideo } from './useUltraWideVideo'
export { useCinemaMode } from './useCinemaMode'
export { usePreloadVideoData } from './usePreloadVideoData'

export { useMissingVideos } from './useMissingVideos'

// ============================================================================
// VIDEO SERVER & AVAILABILITY
// ============================================================================
export { useVideoServerAvailability } from './useVideoServerAvailability'

// ============================================================================
// VIDEO STATISTICS & EVENTS
// ============================================================================
export { useEventStats, useUserReactionStatus } from './useEventStats'

// ============================================================================
// PLAYLIST
// ============================================================================
export { usePlaylists, useUserPlaylists } from './usePlaylist'
export type { Playlist } from './usePlaylist'
export { useGlobalPlaylists } from './useGlobalPlaylists'
export type { GlobalPlaylist } from './useGlobalPlaylists'
export { usePlaylistDetails } from './usePlaylistDetails'
export { usePlaylistNavigation } from './usePlaylistNavigation'

// ============================================================================
// WALLET & ZAPS
// ============================================================================
// export { useWallet } from './useWallet';

export { useEventZaps } from '@nostube/widgets/hooks/useEventZaps'
export { useZappedEvents } from './useZappedEvents'

// ============================================================================
// UPLOAD & TRANSCODING
// ============================================================================
export { useVideoUpload } from './useVideoUpload'
export { useUserBlossomServers } from './useUserBlossomServers'
export { useTagIndex } from './useTagIndex'

// ============================================================================
// CONFIG & PRESETS
// ============================================================================
export { useSelectedPreset } from './useSelectedPreset'

// ============================================================================
// RELAY & NOSTR
// ============================================================================
export { useAppContext } from './useAppContext'
export { useNostrPublish } from './useNostrPublish'
export { useVideoPageRelays, useAuthorPageRelays } from './useContextRelays'
export { useReadRelays } from './useReadRelays'
export { useUserRelays, useInteractionRelays } from './useUserRelays'

// ============================================================================
// UI UTILITIES
// ============================================================================

export { useDialogState } from './useDialogState'

export { useToast } from './useToast'
export { useInfiniteScroll } from './useInfiniteScroll'

export { useIsMobile } from '@nostube/widgets/hooks/useIsMobile'
export { useIsPortrait } from './useIsPortrait'
