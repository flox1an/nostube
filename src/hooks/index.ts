/**
 * Hooks barrel export - organized by domain for easier discovery.
 *
 * Usage: import { useCurrentUser, useProfile } from '@/hooks'
 */

// ============================================================================
// ACCOUNT PERSISTENCE (utilities, not hooks)
// ============================================================================
export {
  restoreAccountsToManager,
  saveActiveAccount,
  removeAccountFromStorage,
  saveAccountToStorage,
  loadAccountsFromStorage,
  loadActiveAccount,
  canRestoreExtensionAccount,
  restoreAccount,
  clearAllAccounts,
} from './useAccountPersistence'
export type { AccountMethod, PersistedAccount } from './useAccountPersistence'

// ============================================================================
// AUTH & USER
// ============================================================================
export { useCurrentUser } from './useCurrentUser'
export { useLoginActions } from './useLoginActions'
export { useLoggedInAccounts } from './useLoggedInAccounts'
export type { Account } from './useLoggedInAccounts'

// ============================================================================
// PROFILE & SOCIAL
// ============================================================================
export { useProfile } from './useProfile'
export { useBatchedProfileLoader, requestProfile } from './useBatchedProfiles'
export { useFollowedAuthors } from './useFollowedAuthors'
export { useFollowSet } from './useFollowSet'
export { useReactions } from './useReactions'
export { useLikedEvents } from './useLikedEvents'
export { useAuthorLikedVideos } from './useAuthorLikedVideos'
export { useCommentCount } from './useCommentCount'
export { useReportedPubkeys } from './useReportedPubkeys'
export type { ReportedPubkeys } from './useReportedPubkeys'
export { useReports } from './useReports'
export type { ProcessedReportEvent } from './useReports'

// ============================================================================
// VIDEO PLAYBACK & PLAYER
// ============================================================================
export { default as useVideoTimeline } from './useVideoTimeline'
export { useVideoPlayPosition } from './useVideoPlayPosition'
export { useVideoKeyboardShortcuts } from './useVideoKeyboardShortcuts'
export { useVideoHistory } from './useVideoHistory'
export type { VideoHistoryEntry } from './useVideoHistory'
export { useVideoNotes } from './useVideoNotes'
export type { VideoNote } from './useVideoNotes'
export { useUltraWideVideo } from './useUltraWideVideo'
export { useCinemaMode } from './useCinemaMode'
export { usePreloadVideoData } from './usePreloadVideoData'
export { useMissingVideos } from './useMissingVideos'

// ============================================================================
// VIDEO SERVER & AVAILABILITY
// ============================================================================
export { useVideoServerAvailability } from './useVideoServerAvailability'
export type { ServerInfo, ServerAvailability, ServerStatus } from './useVideoServerAvailability'

// ============================================================================
// VIDEO STATISTICS & EVENTS
// ============================================================================
export { useEventStats, useUserReactionStatus } from './useEventStats'

// ============================================================================
// PLAYLIST
// ============================================================================
export { usePlaylists, useUserPlaylists } from './usePlaylist'
export type { Playlist, Video } from './usePlaylist'
export { usePlaylistDetails } from './usePlaylistDetails'
export { usePlaylistNavigation } from './usePlaylistNavigation'

// ============================================================================
// WALLET & ZAPS
// ============================================================================
export { useWallet } from './useWallet'
export { useZap } from './useZap'
export { useEventZaps, useVideoZaps } from './useEventZaps'
export { useZappedEvents } from './useZappedEvents'

// ============================================================================
// UPLOAD & TRANSCODING
// ============================================================================
export { useVideoUpload } from './useVideoUpload'
export { useDvmTranscode } from './useDvmTranscode'
export type { TranscodeStatus, TranscodeProgress, UseDvmTranscodeResult } from './useDvmTranscode'
export { useUserBlossomServers } from './useUserBlossomServers'
export { useTagIndex } from './useTagIndex'
export type { TagIndexEntry } from './useTagIndex'

// ============================================================================
// CONFIG & PRESETS
// ============================================================================
export { useSelectedPreset } from './useSelectedPreset'

// ============================================================================
// RELAY & NOSTR
// ============================================================================
export { useAppContext } from './useAppContext'
export { useNostrPublish } from './useNostrPublish'
export { useContextRelays, useVideoPageRelays, useAuthorPageRelays } from './useContextRelays'
export { useReadRelays } from './useReadRelays'
export { useWriteRelays } from './useWriteRelays'
export { useUserRelays } from './useUserRelays'
export { useStableRelays } from './useStableRelays'
export { useTimelineLoader } from './useTimelineLoader'

// ============================================================================
// UI UTILITIES
// ============================================================================
export { useDebounce } from './useDebounce'
export { useDialogState } from './useDialogState'
export type { DialogState } from './useDialogState'
export { useFormDialog } from './useFormDialog'
export { useLocalStorage } from './useLocalStorage'
export { useQueryParams } from './useQueryParams'
export { useToast, toast } from './useToast'
export { useInfiniteScroll } from './useInfiniteScroll'
export { useScrollDirection } from './useScrollDirection'
export { useWindowWidth } from './useWindowWidth'
export { useIsMobile } from './useIsMobile'
export { useIsPortrait } from './useIsPortrait'
export { useAsyncAction } from './useAsyncAction'
