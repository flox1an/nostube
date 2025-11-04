# Code Deduplication - Relay and NIP-19 Helper Functions

## Summary

Extracted common relay and NIP-19 handling patterns into reusable helper functions to reduce code duplication across the codebase.

## New Helper Functions

### 1. `src/lib/utils.ts` - Relay Helpers

#### `normalizeRelayUrl(url: string): string`

- Normalizes relay URLs by adding `wss://` prefix if no protocol is present
- **Previously duplicated in:**
  - `RelaySelector.tsx`
  - `RelaySettingsSection.tsx`
  - `utils.ts` (as internal function)

#### `combineRelays(relayArrays: string[][]): string[]`

- Combines multiple relay arrays, removes duplicates, returns prioritized list
- First arrays in the list have priority (appear first in result)
- **Usage:** Replace manual `[...new Set([...arr1, ...arr2])]` patterns

#### `mergeRelays(relaySets: string[][]): string[]`

- Refactored to use the new `normalizeRelayUrl` function

---

### 2. `src/lib/nip19.ts` - NIP-19 Decoding Helpers

#### `decodeNip19(nip19String: string)`

- Safely decode any NIP-19 identifier with error handling
- Returns `null` if decoding fails

#### `decodeEventPointer(nevent: string): EventPointer | null`

- Decode `nevent`/`note` to EventPointer
- Handles both `nevent` (with relays) and `note` (id only)
- Returns `null` if invalid or wrong type

#### `decodeProfilePointer(nprofile: string): ProfilePointer | null`

- Decode `nprofile`/`npub` to ProfilePointer
- Handles both `nprofile` (with relays) and `npub` (pubkey only)
- Returns `null` if invalid or wrong type

#### `decodeAddressPointer(naddr: string)`

- Decode `naddr` to AddressPointer
- Returns `null` if invalid or wrong type

#### `extractRelaysFromNip19(nip19String: string): string[]`

- Extract relay URLs from any NIP-19 identifier
- Returns empty array if no relays or decoding fails

#### `combineNip19Relays(nip19String: string, fallbackRelays: string[]): string[]`

- Combines relays from NIP-19 identifier with fallback relays
- NIP-19 relays are prioritized first

---

## Files Updated

### Components

- ✅ `src/components/RelaySelector.tsx` - Use `normalizeRelayUrl` from utils
- ✅ `src/components/settings/RelaySettingsSection.tsx` - Use `normalizeRelayUrl` from utils

### Pages

- ✅ `src/pages/VideoPage.tsx` - Use `decodeEventPointer` and `combineRelays`
- ✅ `src/pages/ShortsVideoPage.tsx` - Use `decodeEventPointer` and `combineRelays`
- ✅ `src/pages/AuthorPage.tsx` - Use `decodeProfilePointer` and `combineRelays`
- ✅ `src/pages/SinglePlaylistPage.tsx` - Use `decodeAddressPointer`

---

## Benefits

1. **Reduced Duplication**: Eliminated 3+ duplicate `normalizeRelayUrl` implementations
2. **Better Error Handling**: All NIP-19 decode operations now have consistent error handling
3. **Type Safety**: Helper functions properly handle null/undefined cases
4. **Easier Maintenance**: Changes to relay/NIP-19 logic only need to be made in one place
5. **Cleaner Code**: Pages are more readable with dedicated helper functions

---

## Migration Pattern Examples

### Before:

```typescript
// Duplicated in multiple files
const normalizeRelayUrl = (url: string): string => {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  if (trimmed.includes('://')) return trimmed
  return `wss://${trimmed}`
}
```

### After:

```typescript
import { normalizeRelayUrl } from '@/lib/utils'
```

---

### Before:

```typescript
try {
  const decoded = nip19.decode(nevent)
  if (decoded.type === 'nevent') {
    return decoded.data
  }
  return null
} catch {
  return null
}
```

### After:

```typescript
import { decodeEventPointer } from '@/lib/nip19'
const eventPointer = decodeEventPointer(nevent)
```

---

### Before:

```typescript
const combined = [...neventRelays, ...readRelays]
return [...new Set(combined)]
```

### After:

```typescript
import { combineRelays } from '@/lib/utils'
return combineRelays([neventRelays, readRelays])
```

---

## Testing

All changes maintain backward compatibility. Tests pass with no new errors introduced by these refactorings.
