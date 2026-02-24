# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Generic `draft-persistence-storage` utilities for localStorage CRUD and Nostr merge with timestamp-based conflict resolution
- Generic `useDraftPersistence<T>` hook wrapping storage utilities with NIP-78 Nostr sync, debounced saves, milestone detection, and encrypted backup
- Generic `useFileUpload` hook wrapping blossom upload/mirror/delete pipeline into a reusable React hook with progress tracking and error handling

### Changed

- Refactored `useVideoUpload` to use `useFileUpload` for thumbnail, video, and subtitle uploads, eliminating direct `uploadFileToMultipleServersChunked`/`mirrorBlobsToServers` calls

### Changed

- Rewrote `useUploadDrafts` as a thin wrapper around `useDraftPersistence<UploadDraft>`, reducing ~460 lines to ~100 lines while preserving the identical public API
- Added backward-compatible `drafts` key reading in `getItemsFromStorage` for legacy localStorage data migration
- Migrated `UploadManagerProvider` draft management to `useDraftPersistence`, removing ~210 lines of duplicate saveToNostr, debounce, NIP-78 subscription, and CRUD logic while DVM transcode code now uses `draftPersistence.getItem`/`updateItem` instead of direct localStorage calls

## [0.2.3] - 2026-02-24

### Added

- Online/offline connectivity indicator banner below header with animated slide-in and "Back online" toast

## [0.2.2] - 2026-02-23

### Fixed

- Like/dislike button padding (px-4) and memoized AppContext value to reduce unnecessary re-renders

## [0.2.1] - 2026-02-23

### Changed

- Sidebar and mini sidebar now highlight the current page with `bg-accent` background
- Mini sidebar items have rounded right corners
- Removed "Watch Later" from sidebar (disabled/unused feature)

## [0.2.0] - 2026-02-23

### Added

- Service worker for app shell caching — app loads instantly and works offline (vite-plugin-pwa)

## [0.1.6] - 2026-02-23

### Fixed

- Even padding on like/dislike buttons in video page (pr-0 → px-2)
- Upload thumbnail "Generate from video" tab now works when videos are uploaded via blossom (falls back to uploaded variant URL)
- Removed redundant thumbnail preview section; "Set as thumbnail" button sits below the slider and waits for video frame capture

### Changed

- Added upload button to user dropdown menu on mobile
- Hidden "Previous", "Next", and "Save Draft" text labels on mobile upload navigation (icon-only)
- Hidden thumbnail tab labels on mobile (icon-only)
- Reordered thumbnail tabs: Generate from video (default) → Upload → Enter URL

## [0.1.5] - 2026-02-23

### Fixed

- Zap notifications incorrectly displayed as comment notifications by adding explicit `notificationType` discriminator to notification type guards
- Filter zap notifications to only show zaps on video events (kinds 21, 22, 34235, 34236), ignoring zaps on comments or other event types
- Increased gap between reaction icons and counts in video page (gap-1 → gap-2)
