# Cache Management Feature

## Overview

The Cache Management section in Settings allows users to monitor and clear their local IndexedDB cache that stores Nostr events.

## Location

**Settings → Cache Management**

Access via:

- Sidebar → Settings (available to all users)
- URL: `/settings`

## Features

### 1. Cache Size Display

- Shows approximate storage used by the cache
- Calculated using the Storage API (`navigator.storage.estimate()`)
- Displays size in megabytes (MB)
- Includes a "Refresh" button to recalculate

### 2. Clear Cache Button

- Removes all cached Nostr events from IndexedDB
- Shows confirmation dialog before clearing
- Displays loading state during operation
- Automatically reloads the app after clearing

### 3. Information Display

Shows what data gets cleared:

- All cached Nostr events
- Event metadata and profiles
- Timeline data
- Local database storage

**Important:** Does NOT affect:

- Account settings
- Relay configuration
- App preferences
- Blossom server settings

## Implementation Details

### Component

`src/components/settings/CacheSettingsSection.tsx`

### Key Functions

#### `calculateCacheSize()`

```typescript
const calculateCacheSize = async () => {
  const estimate = await navigator.storage.estimate()
  const usageInMB = ((estimate.usage || 0) / 1024 / 1024).toFixed(2)
  setCacheSize(`~${usageInMB} MB`)
}
```

#### `handleClearCache()`

```typescript
const handleClearCache = async () => {
  // Get all IndexedDB databases
  const databases = await window.indexedDB.databases()

  // Delete each database
  for (const db of databases) {
    await window.indexedDB.deleteDatabase(db.name!)
  }

  // Reload the app
  window.location.reload()
}
```

### Cache System

The app uses `nostr-idb` for caching Nostr events in IndexedDB:

**File:** `src/nostr/core.ts`

```typescript
import { openDB, getEventsForFilters, addEvents } from 'nostr-idb'

let cache: NostrIDB | undefined

async function ensureCache() {
  if (!cache) {
    cache = await openDB()
  }
  return cache
}

// Save all new events to cache
presistEventsToCache(eventStore, events => addEvents(cache!, events))
```

## User Experience

### Normal Flow

1. User opens Settings
2. Sees cache size displayed
3. Can click "Refresh" to update size
4. Can click "Clear Cache" to remove all cached data

### Clear Cache Flow

1. User clicks "Clear Cache"
2. Confirmation dialog appears
3. User confirms action
4. App deletes all IndexedDB databases
5. Toast notification shows success
6. App automatically reloads after 1.5 seconds

### Error Handling

- If cache size calculation fails, shows "Unknown"
- If clearing fails, shows error toast
- Handles blocked databases gracefully
- Loading states during operations

## Benefits

### For Users

- **Free up storage space** - Remove large amounts of cached data
- **Fresh start** - Clear stale or corrupted cache
- **Troubleshooting** - Fix issues caused by bad cached data
- **Privacy** - Remove locally stored event history

### For Development

- **Debug cache issues** - Easy way to test with clean cache
- **Performance testing** - Compare cold vs warm cache performance
- **Storage management** - Monitor cache growth over time

## Browser Compatibility

- ✅ Chrome/Edge - Full support
- ✅ Firefox - Full support
- ✅ Safari - Full support
- ❌ Older browsers - May show "Unknown" for cache size

Requires:

- `IndexedDB` API
- `navigator.storage.estimate()` (for size calculation)
- `window.indexedDB.databases()` (for listing databases)

## Security & Privacy

- **Local only** - All operations happen in the browser
- **No server communication** - Cache clearing is entirely client-side
- **Reversible** - Events will be re-fetched from relays as needed
- **Safe operation** - Only affects IndexedDB, not other storage

## Technical Notes

### Why Reload After Clear?

The app reloads after clearing cache to:

1. Reinitialize the `EventStore`
2. Recreate IndexedDB connections
3. Ensure clean state across all components
4. Prevent errors from stale references

### Database Names

The `nostr-idb` library typically creates databases with names like:

- `nostr-events` - Main event storage
- Other databases depending on configuration

### Storage Estimate

The `navigator.storage.estimate()` API provides:

- `usage` - Bytes currently used
- `quota` - Maximum bytes available

Note: This is an estimate and may not be 100% accurate.

## Future Enhancements

Potential improvements:

- [ ] Selective cache clearing (by relay, by kind, by date)
- [ ] Cache statistics (event count, oldest event, etc.)
- [ ] Automatic cache cleanup (remove old events)
- [ ] Export/import cache data
- [ ] Cache warming options (preload common events)

## Related Files

- `src/components/settings/CacheSettingsSection.tsx` - Cache settings UI
- `src/pages/settings/SettingsPage.tsx` - Settings page layout
- `src/nostr/core.ts` - Cache initialization
- `package.json` - `nostr-idb` dependency
