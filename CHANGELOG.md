# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Upload Draft Persistence**: NIP-78 based draft system with localStorage + Nostr sync. Up to 10 drafts, auto-save, 30-day cleanup, NIP-44 encryption
- **Upload Draft Encryption**: Drafts encrypted with NIP-44 for privacy. Backward compatible with unencrypted drafts
- **NIP-51 Follow Sets**: Migrated from NIP-2 contact lists to NIP-51 follow sets with auto-import dialog
- **Blossom Server Onboarding**: Two-step onboarding with follow import and Blossom server configuration
- **Video Comment Notifications**: Bell icon with dropdown showing comment notifications, 7-day persistence
- **Category Browsing**: 9 categories with `/category/:category` routes
- **NSFW Author Filtering**: Automatic content warnings for specific authors
- **Share Dialog Embed Tab**: Copy iframe embed code with optional timestamp
- **Embed Player Features**: Pulsating logo, clickable title/author links, timestamp preservation, content warning overlay, play/pause indicator, event caching, profile fetching
- **NIP-50 Full-Text Search**: Search videos via relay.nostr.band
- **Media Caching Servers**: Separate caching/proxy configuration
- **Watch History**: Track last 100 watched videos
- **Mirror Video Dialog**: Mirror videos to additional Blossom servers
- **Multi-Video Upload**: Upload multiple quality variants (4K/1080p/720p/etc)
- **Internationalization**: EN/DE/FR/ES support with 500+ translations
- **NIP-71 Addressable Events**: Support for kinds 34235/34236
- **Hashtag Search**: `/tag/:tag` routes with clickable hashtags
- **Video Notes Page**: View and repost videos from Kind 1 notes
- **Docker Deployment**: Multi-stage Dockerfile with runtime env vars

### Changed

- **Upload Page Advanced Button**: Opens Blossom dialog instead of navigating to settings
- **Onboarding Separation**: Moved Blossom config from login to upload page
- **Embed Player Performance**: Faster load times, reduced timeouts, fewer relays
- **Video Grid Skeletons**: 2 rows of loading placeholders during pagination
- **Label Button**: Moved to burger menu, beta users only
- **Shorts Hashtags**: Now clickable links
- **Video Page Auth**: Report/Mirror require login
- **Blossom Onboarding UI**: Cleaner two-column layout
- **Embed Player Branding**: Logo in top-right, auto-hide
- **Shorts Comments**: Max-width 2xl, centered
- **Comments Pagination**: 15 per page, collapsible replies
- **Play/Pause Overlay**: Smaller icon, faster fade
- **Button Standardization**: Using shadcn/ui components
- **Upload Button**: Only shows when logged in
- **Package Updates**: React 19.2.0, Applesauce 4.4.2, Vitest 4.0.10
- **Tag Normalization**: All hashtags lowercase
- **Default Config**: relay.divine.video relay, almond.slidestr.net Blossom server

### Changed

- **Draft Deletion UX**: Replaced 5-second undo toast with confirmation dialog offering three options: Cancel, Delete draft only, or Delete draft + media files from Blossom servers. Dialog shows context-aware descriptions based on whether draft contains uploaded media. Includes real-time deletion progress feedback and partial success/failure reporting (DeleteDraftDialog.tsx, DraftPicker.tsx)
- **Draft Picker Layout**: Moved "New Upload" button below draft list, centered with secondary styling for better visual hierarchy
- **Upload Dialog Layout**: Redesigned with responsive two-column layout. Left column (350px) shows video quality summary and thumbnail section. Right column shows form fields (title, description, tags, language, content warning). Single column on mobile (VideoUpload.tsx:343-424)
- **Video Quality Display**: Simplified video quality display with expandable details. Shows quality badges, dimensions, duration, total size, upload/mirror counts, and codec warnings in collapsed state. Click "Show Details" to expand full VideoVariantsTable with all technical details (VideoVariantsSummary.tsx)

### Fixed

- **Draft Generated Thumbnails**: Drafts with generated thumbnails now show video thumbnail in draft list using image proxy
- **Draft Thumbnail Extensions**: Fixed image proxy failing to load thumbnails from Blossom blob URLs without file extensions. Added `ensureFileExtension()` helper that appends appropriate extensions (.jpg, .png, .mp4, etc.) based on MIME types before passing URLs to image proxy (utils.ts:177-205, DraftCard.tsx:23-47)
- **Publish Button**: Now works with generated thumbnails after draft restore
- **Upload Draft Loop**: Fixed infinite re-render in draft persistence
- **Draft Title Persistence**: Draft changes now appear immediately in picker
- **Draft Nostr Sync**: Encrypts and publishes even on quick navigation
- **Draft Deletion Sync**: Deletions now sync to Nostr immediately
- **Dialog Context Errors**: Fixed component hierarchy issues
- **Onboarding Bugs**: Dialog closing, showing for existing users
- **Build Issues**: Vercel deployment, ESLint errors
- **Video Availability Alert**: Only shows for Blossom videos
- **Shorts Performance**: Reduced IntersectionObserver calls 50-70%
- **NSFW Filtering**: Videos with content warnings filtered from suggestions
- **Grid Performance**: Removed console logs, added caching, memoization
- **Embed Player**: Test suite, branding position, nevent encoding
- **Video Loading**: Fixed timeline loading on login, reset logic
- **Blossom URLs**: Normalized to prevent double slashes
- **Infinite Renders**: Fixed in useUserBlossomServers, HomePage, ShortsPage
- **naddr Support**: Video pages now handle both nevent and naddr
- **Addressable Events**: Using naddr encoding for kinds 34235/34236
- **Thumbnail Loading**: Shows placeholder, handles errors
- **Comment Wrapping**: Fixed text overflow issues
- **Pagination Loading**: Fixed skeleton display
- **iOS Autoplay**: Fixed after multiple videos
- **Mobile Sidebar**: Safe area padding
