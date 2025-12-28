# Admin Presets Feature Design

## Overview

Decentralized app configuration through Nostr events. Anyone can publish a preset, users can browse and select which preset to use. Presets control default relays, blossom proxy, blocked users, NSFW authors, and blocked events.

## Data Model

### Kind 30078 Event Structure

```typescript
{
  kind: 30078,
  pubkey: "<owner-hex>",
  tags: [
    ["d", "nostube-presets"],
    ["name", "Official Nostube Preset"],
    ["description", "Curated relays and moderation list"]  // optional
  ],
  content: JSON.stringify({
    defaultRelays: ["wss://relay.divine.video", ...],
    defaultBlossomProxy: "https://proxy.example.com",  // optional
    blockedPubkeys: ["hex1", "hex2", ...],
    nsfwPubkeys: ["hex3", "hex4", ...],
    blockedEvents: ["eventid1", "eventid2", ...]
  })
}
```

### TypeScript Types (`src/types/preset.ts`)

```typescript
interface NostubePresetContent {
  defaultRelays: string[]
  defaultBlossomProxy?: string
  blockedPubkeys: string[]
  nsfwPubkeys: string[]
  blockedEvents: string[]
}

interface NostubePreset extends NostubePresetContent {
  name: string
  description?: string
  pubkey: string  // owner
  createdAt: number
}
```

## Routes & Pages

### `/admin` - Edit Your Preset (Hidden)

- Not linked in navigation
- Shows current user's preset (or empty form if none exists)
- Form fields: name, description, relays, blossom proxy, blocked pubkeys, NSFW pubkeys, blocked events
- Save button publishes kind 30078 event
- Requires login (show prompt if not logged in)

### `/presets` - Browse & Select Presets

- Fetches all kind 30078 d="nostube-presets" from relays
- Cards showing: owner avatar, owner name, preset name, description
- Current selection highlighted with checkmark
- Click to select/apply a preset
- Link to `/admin` to create/edit your own

## Hooks & Data Flow

### New Hooks

1. **`usePresets()`** - Fetch all presets from relays
   - Queries kind 30078, d="nostube-presets"
   - Returns array of `NostubePreset` with owner profiles

2. **`useSelectedPreset()`** - Get the currently active preset
   - Reads `selectedPresetPubkey` from AppContext
   - Falls back to default pubkey if none set
   - Fetches and returns that specific preset
   - Caches in localStorage for instant hydration

3. **`useMyPreset()`** - Get/edit current user's preset (for admin page)
   - Fetches current user's kind 30078 d="nostube-presets"
   - Returns preset data + `savePreset(data)` function

### AppContext Changes

```typescript
interface AppConfig {
  // existing...
  nsfwFilter: 'hide' | 'warning' | 'show'

  // new
  selectedPresetPubkey: string | null  // null = use default
}
```

## UI Components

### Admin Page

- Header: "Manage Your Preset"
- Login prompt if not authenticated
- Form sections:
  - **Basic Info**: Name input, Description textarea
  - **Relays**: List with add/remove, URL validation
  - **Blossom Proxy**: Optional URL input
  - **Blocked Pubkeys**: List with add (npub or hex), shows resolved profile names
  - **NSFW Pubkeys**: Same as blocked, but marks content NSFW instead of hiding
  - **Blocked Events**: List with add (nevent or hex event ID)
- Save button (publishes to relays)
- Toast confirmation on save

### Presets Page

- Header: "Choose a Preset"
- Grid of preset cards, each showing:
  - Owner avatar (from profile)
  - Owner display name
  - Preset name (bold)
  - Description (truncated)
  - Checkmark if currently selected
- Click card to select
- Link to `/admin` to create/edit your own

### Shared Components

- `PresetCard` - Reusable card with avatar, name, description
- `PubkeyListEditor` - Add/remove pubkeys with profile resolution

## Migration & Fallbacks

### Migration of Hardcoded Lists

1. **Remove from code:**
   - `src/lib/nsfw-authors.ts` - Delete `NSFW_AUTHORS` array, keep `isNSFWAuthor()` but read from preset
   - `src/hooks/useReportedPubkeys.ts` - Remove `blockPubkeys` constant, merge preset blocklist with dynamic reports

2. **Seed default preset:**
   - Include current hardcoded values in default preset:
     - 7 blocked pubkeys from `useReportedPubkeys.ts`
     - 3 NSFW pubkeys from `nsfw-authors.ts`
     - 6 default relays from `constants/relays.ts`

### Fallback Behavior

- If selected preset fails to load, show warning toast
- Fall back to empty lists (no blocks, no NSFW marking)
- Relays fall back to `presetRelays` from `constants/relays.ts`
- User can re-select a working preset

### Graceful Loading

- Cache last-loaded preset in localStorage for instant hydration
- Fetch fresh preset in background, update if changed
- Prevents flash of unfiltered content on page load

## File Changes

### New Files

- `src/types/preset.ts` - Type definitions
- `src/pages/AdminPage.tsx` - Edit your preset
- `src/pages/PresetsPage.tsx` - Browse/select presets
- `src/hooks/usePresets.ts` - Fetch all presets
- `src/hooks/useSelectedPreset.ts` - Get active preset with caching
- `src/hooks/useMyPreset.ts` - Get/save current user's preset
- `src/components/presets/PresetCard.tsx` - Display card
- `src/components/presets/PubkeyListEditor.tsx` - Add/remove pubkeys

### Modified Files

- `src/AppRouter.tsx` - Add `/admin` and `/presets` routes
- `src/contexts/AppContext.ts` - Add `selectedPresetPubkey` to config
- `src/hooks/useReportedPubkeys.ts` - Read from preset instead of hardcoded
- `src/lib/nsfw-authors.ts` - Convert to hook reading from preset
- `src/constants/relays.ts` - Keep as fallback only

## Constants

- Default preset pubkey: `npub1klr0dy2ul2dx9llk58czvpx73rprcmrvd5dc7ck8esg8f8es06qs427gxc`
- Event kind: 30078
- D-tag: `nostube-presets`
