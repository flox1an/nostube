# Barrel Export Fixes - Complete Guide

## All Issues Found and Fixed

### 1. ❌ `useAccountPersistence` - Non-existent Hook Export

**Error:** `The requested module '/src/hooks/useAccountPersistence.ts' does not provide an export named 'useAccountPersistence'`

**Problem:** The barrel export was trying to export a hook called `useAccountPersistence`, but the file only exports utility functions, not a hook.

**Fix:** Updated to export the actual functions from the file:

```typescript
// Before (WRONG)
export {
  useAccountPersistence,
  restoreAccountsToManager,
  saveActiveAccount,
  removeAccountFromStorage,
} from './useAccountPersistence'

// After (CORRECT)
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
```

### 2. ❌ `usePlaylist` - Wrong Hook Name

**Error:** `The requested module '/src/hooks/usePlaylist.ts' does not provide an export named 'usePlaylist'`

**Problem:** The barrel export was trying to export `usePlaylist` (singular), but the file exports `usePlaylists` (plural) and `useUserPlaylists`.

**Fix:** Updated to export the correct hook names:

```typescript
// Before (WRONG)
export { usePlaylist, usePlaylists, useUserPlaylists } from './usePlaylist'

// After (CORRECT)
export { usePlaylists, useUserPlaylists } from './usePlaylist'
```

### 3. ❌ `useVideoTimeline` - Default Export

**Error:** `The requested module '/src/hooks/useVideoTimeline.ts' does not provide an export named 'useVideoTimeline'`

**Problem:** The file uses `export default function useVideoTimeline()` instead of a named export.

**Fix:** Import the default export and re-export it as a named export:

```typescript
// Before (WRONG)
export { useVideoTimeline } from './useVideoTimeline'

// After (CORRECT)
export { default as useVideoTimeline } from './useVideoTimeline'
```

## Additional Improvements

### Added Missing Type Exports

To make the barrel export more complete, also added:

- `Account` type from `useLoggedInAccounts`
- `ProcessedReportEvent` type from `useReports`

### Added Documentation Comments

The barrel export file now has clear sections:

- Account persistence utilities
- Hooks
- Default exports (special cases)

## Final Barrel Export File Structure

The corrected `src/hooks/index.ts` now exports:

### Functions from useAccountPersistence

- `restoreAccountsToManager`
- `saveActiveAccount`
- `removeAccountFromStorage`
- `saveAccountToStorage`
- `loadAccountsFromStorage`
- `loadActiveAccount`
- `canRestoreExtensionAccount`
- `restoreAccount`
- `clearAllAccounts`

### Types from useAccountPersistence

- `AccountMethod`
- `PersistedAccount`

### Hooks

- `useAppContext`
- `useCurrentUser`
- `useDebounce`
- `useFollowedAuthors`
- `useInfiniteScroll`
- `useIsMobile`
- `useLikedEvents`
- `useLocalStorage`
- `useLoggedInAccounts`
- `useLoginActions`
- `useMissingVideos`
- `useNostrPublish`
- `usePlaylists` ✅
- `useUserPlaylists` ✅
- `useProfile`
- `useQueryParams`
- `useReadRelays`
- `useRelaySync`
- `useReportedPubkeys`
- `useReports`
- `useToast` + `toast` function
- `useUserBlossomServers`
- `useUserRelays`
- `useVideoTimeline`
- `useWindowWidth`
- `useWriteRelays`

### Types from other hooks

- `Playlist`
- `Video`
- `ReportedPubkeys`

## Verification

✅ **Build passes** - `npm run build` completes successfully
✅ **TypeScript passes** - `npm run typecheck` has no errors
✅ **Dev mode works** - `npm run dev` starts without errors
✅ **All exports verified** - No missing or incorrect exports

## Key Lessons Learned

When creating barrel exports, always verify:

1. **Check Export Types**
   - Named exports: `export function xyz()`
   - Default exports: `export default function xyz()`
   - Const exports: `export const xyz = () => {}`

2. **Match Exact Names**
   - Use the exact export name from the source file
   - Check for plural vs singular (e.g., `usePlaylists` not `usePlaylist`)

3. **Handle Default Exports**
   - Use `export { default as functionName }` syntax
   - Don't try to use regular named export syntax

4. **Include Types**
   - Export interfaces and types that consumers need
   - Use `export type { ... }` for type-only exports

5. **Test Both Modes**
   - Production build: `npm run build`
   - Development mode: `npm run dev`
   - TypeScript check: `npm run typecheck`

## How to Verify Exports

Use this command to check what a file actually exports:

```bash
grep -E "^export (default |function |const |class |interface |type )" src/hooks/useXxx.ts
```

## Common Patterns

### Named Function Export

```typescript
// In useXxx.ts
export function useXxx() { ... }

// In index.ts
export { useXxx } from './useXxx'
```

### Default Function Export

```typescript
// In useXxx.ts
export default function useXxx() { ... }

// In index.ts
export { default as useXxx } from './useXxx'
```

### Const Function Export

```typescript
// In useXxx.ts
export const useXxx = () => { ... }

// In index.ts
export { useXxx } from './useXxx'
```

### Multiple Exports

```typescript
// In useXxx.ts
export function useXxx() { ... }
export type XxxType = { ... }
export interface XxxInterface { ... }

// In index.ts
export { useXxx } from './useXxx'
export type { XxxType, XxxInterface } from './useXxx'
```
