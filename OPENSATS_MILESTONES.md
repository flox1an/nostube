# OpenSats Grant Milestones - Implementation Status

**Grant ID:** 922272
**Period:** January 2026 - June 2026 (6 months)
**Last Updated:** 2026-01-14

---

## Overview

| Milestone                    | Target   | Status      |
| ---------------------------- | -------- | ----------- |
| M1: Base Version             | Jan 2026 | ✅ Complete |
| M2: DVM Transcoding          | Feb 2026 | ✅ Complete |
| M3: Blossom Storage          | Mar 2026 | ✅ Complete |
| M4: WOT & User Contributions | Apr 2026 | ⚠️ ~30%     |
| M5: Advanced Features        | May 2026 | ✅ Complete |
| M6: Stability/UX             | Jun 2026 | ⚠️ Ongoing  |

---

## Milestone 1: Base Version (January 2026) ✅ COMPLETE

Port vibe-coded web client to Applesauce with basic upload and browsing.

| Item                | Status  | Location                                                                 |
| ------------------- | ------- | ------------------------------------------------------------------------ |
| Port to Applesauce  | ✅ Done | `src/nostr/core.ts` - singleton EventStore/RelayPool                     |
| Applesauce packages | ✅ Done | v5.0.0 (core, relay, accounts, signers, loaders, factory, wallet, react) |
| Basic upload        | ✅ Done | `src/pages/UploadPage.tsx` - multi-step wizard                           |
| Basic browsing      | ✅ Done | Home, Categories, Hashtags, Search pages                                 |
| Video grid display  | ✅ Done | `src/components/VideoGrid.tsx` with infinite scroll                      |

---

## Milestone 2: DVM Transcoding (February 2026) ✅ COMPLETE

Distributed transcoding system where users can contribute GPU/CPU power. Workers compensated using Cashu eCash.

| Item                     | Status  | Location                                            |
| ------------------------ | ------- | --------------------------------------------------- |
| DVM transcoding hook     | ✅ Done | `src/hooks/useDvmTranscode.ts`                      |
| Multi-resolution support | ✅ Done | 1080p, 720p, 480p, 360p, 240p                       |
| Cashu eCash payments     | ✅ Done | `src/contexts/WalletContext.tsx`                    |
| DVM handler discovery    | ✅ Done | NIP-89 (kind 31990)                                 |
| Resumable jobs           | ✅ Done | 12-hour timeout for job recovery                    |
| Progress tracking        | ✅ Done | Status messages, queue management                   |
| Codec detection          | ✅ Done | hev1, av01, vp09, vp9 compatibility                 |
| DVM utilities            | ✅ Done | `src/lib/dvm-utils.ts`                              |
| UI component             | ✅ Done | `src/components/video-upload/DvmTranscodeAlert.tsx` |

---

## Milestone 3: Blossom Storage (March 2026) ✅ COMPLETE

Failover, chunked upload, expiration, Cashu payments, multi-tiered servers, discovery.

| Item                   | Status  | Location                                                                 |
| ---------------------- | ------- | ------------------------------------------------------------------------ |
| Chunked upload         | ✅ Done | `src/lib/blossom-upload.ts` - configurable chunk size, concurrent chunks |
| Failover               | ✅ Done | Multi-server fallback URLs in imeta tags                                 |
| Multi-server mirroring | ✅ Done | `mirrorBlobsToServers()` - parallel mirroring                            |
| Expiration support     | ✅ Done | `src/components/video-upload/ExpirationSection.tsx` (1d, 7d, 1mo, 1yr)   |
| Cashu payments         | ✅ Done | `src/contexts/WalletContext.tsx` - NIP-60 wallet                         |
| Multi-tiered servers   | ✅ Done | `src/lib/blossom-servers.ts` - 10+ servers with CDN info                 |
| Server discovery       | ✅ Done | NIP-51 kind 10003 for user blossom servers                               |
| Auth tokens            | ✅ Done | `BlossomClient.createUploadAuth()` with token reuse                      |
| Onboarding             | ✅ Done | `src/components/onboarding/BlossomOnboardingStep.tsx`                    |

---

## Milestone 4: Web of Trust & User Contributions (April 2026) ⚠️ PARTIAL

Users should be able to rehost videos (kind 1063 events) and contribute transcoded versions. WOT required to limit abuse.

| Item                            | Status  | Location                                                    |
| ------------------------------- | ------- | ----------------------------------------------------------- |
| Follow lists                    | ✅ Done | `src/hooks/useFollowSet.ts` - kind 30000/3                  |
| Follow UI                       | ✅ Done | `src/components/FollowButton.tsx`, `FollowImportDialog.tsx` |
| Subscriptions page              | ✅ Done | `src/pages/SubscriptionsPage.tsx`                           |
| **Kind 1063 rehosting**         | ❌ TODO | Users cannot announce video hosting via file metadata       |
| **User-contributed transcodes** | ❌ TODO | No UI for submitting transcoded versions                    |
| **WOT scoring algorithm**       | ❌ TODO | No trust scoring for abuse prevention                       |
| **WOT content filtering**       | ❌ TODO | No WOT integration in recommendations                       |
| Mute lists (kind 10000)         | ❌ TODO | Not implemented                                             |

### Open Tasks for M4

1. **Implement kind 1063 file metadata events**
   - Allow users to publish events indicating they host a video
   - Display rehost count on videos
   - Use rehost data for fallback URL discovery

2. **User-contributed transcodes**
   - UI for users to submit transcoded versions of videos
   - Validation of contributed transcodes
   - Display contributor info on video variants

3. **Web of Trust scoring**
   - Calculate trust scores based on follow graph
   - Weight content by author trust level
   - Filter spam/abuse based on WOT distance

4. **WOT-based content filtering**
   - Integrate WOT into browse/search results
   - Option to show only content from trusted authors
   - Gradual trust building for new users

---

## Milestone 5: Advanced Video Features (May 2026) ✅ COMPLETE

Subtitles, HLS videos, Playlists, and Nostr features (zaps, profiles).

| Item                    | Status  | Location                                                 |
| ----------------------- | ------- | -------------------------------------------------------- |
| Subtitles upload        | ✅ Done | `src/components/video-upload/SubtitleSection.tsx`        |
| Subtitles table         | ✅ Done | `src/components/video-upload/SubtitlesTable.tsx`         |
| Subtitle utilities      | ✅ Done | `src/lib/subtitle-utils.ts`                              |
| Player subtitle support | ✅ Done | Language selection in settings                           |
| HLS playback            | ✅ Done | `src/components/player/hooks/useHls.ts` (hls.js v1.6.13) |
| Quality switching       | ✅ Done | `src/components/player/hooks/useAdaptiveQuality.ts`      |
| Playlists               | ✅ Done | `src/components/PlaylistManager.tsx` - kind 30005        |
| Playlist page           | ✅ Done | `src/pages/SinglePlaylistPage.tsx`                       |
| Zaps (NIP-57)           | ✅ Done | `src/hooks/useZap.ts`, `src/components/ZapDialog.tsx`    |
| Timestamped zaps        | ✅ Done | Video position in zap request                            |
| Zap timeline markers    | ✅ Done | SoundCloud-style progress bar markers                    |
| Profiles                | ✅ Done | `src/hooks/useProfile.ts`, `src/pages/AuthorPage.tsx`    |
| Comments                | ✅ Done | `src/components/comments/VideoComments.tsx`              |
| Reactions               | ✅ Done | `src/components/VideoReactionButtons.tsx`                |
| Notifications           | ✅ Done | `src/hooks/useAllNotifications.ts` - 7-day persistence   |
| Video variants          | ✅ Done | `src/components/player/hooks/useVideoVariantSelector.ts` |
| Keyboard shortcuts      | ✅ Done | `src/hooks/useVideoKeyboardShortcuts.ts` (J/K/L/C/T/F)   |
| Theater mode            | ✅ Done | Toggle in `VideoPlayer.tsx`                              |
| NIP-71 support          | ✅ Done | Kinds 21, 22, 34235, 34236                               |

---

## Milestone 6: Stability, Design & UX (June 2026) ⚠️ ONGOING

| Item                    | Status     | Notes                                 |
| ----------------------- | ---------- | ------------------------------------- |
| Continuous improvements | ✅ Ongoing | See CHANGELOG.md                      |
| Mobile UX               | ✅ Done    | Touch controls, responsive layout     |
| Performance             | ✅ Done    | React.memo, RAF polling, lazy loading |
| Error handling          | ✅ Done    | Failover, recovery mechanisms         |
| Accessibility           | ⚠️ Partial | Keyboard nav done, ARIA needs review  |
| Design polish           | ⚠️ Ongoing | Iterating on feedback                 |
| i18n                    | ✅ Done    | EN/DE/FR/ES translations              |

---

## Ongoing Items (Throughout Grant Period)

| Item                            | Status                                  |
| ------------------------------- | --------------------------------------- |
| Continuous web app improvements | ✅ Active                               |
| Community collaboration         | ✅ Active (zap.stream, Primal, Blossom) |
| NIP standards alignment         | ✅ Active                               |

---

## Out of Scope

- Native mobile apps (iOS/Android)

---

## Summary

**Completed:** 4/6 milestones (M1, M2, M3, M5)
**In Progress:** 2/6 milestones (M4, M6)

**Primary Gap:** Milestone 4 requires implementation of:

- Kind 1063 events for user rehosting
- User-contributed transcode workflow
- Web of Trust scoring and filtering

**Estimated Remaining Work:** ~70% of M4 tasks
