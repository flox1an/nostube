# Empty Author Query Fix

## Problem

The app was making invalid Nostr relay requests with empty author arrays:

```json
["REQ", "subscriptionId", { "kinds": [0], "authors": [""] }]
```

This caused relay errors:

```
["NOTICE","ERROR: bad req: filter item too small"]
```

## Root Cause

The `useProfile` hook was being called with empty strings as pubkey fallbacks:

```typescript
// ❌ WRONG - Passes empty string if pubkey is undefined
const metadata = useProfile({ pubkey: video?.pubkey || '' })
```

When `video?.pubkey` is `undefined`, the fallback `|| ''` provides an empty string, which then gets sent to relays as an invalid author filter.

## Solution

### 1. Add Validation in `useProfile` Hook

**File:** `src/hooks/useProfile.ts`

```typescript
function ProfileQuery(user?: ProfilePointer): Model<ProfileContent | undefined> {
  // Return undefined if user is not provided or pubkey is empty/invalid
  if (!user || !user.pubkey || user.pubkey.trim() === '') {
    return () => of(undefined)
  }

  // ... rest of implementation
}
```

This prevents the hook from making relay requests when the pubkey is missing or empty.

### 2. Fix Call Sites to Pass `undefined` Instead of Empty String

**Files Changed:**

- `src/pages/SinglePlaylistPage.tsx`
- `src/pages/VideoPage.tsx`
- `src/hooks/useCurrentUser.ts`

```typescript
// ❌ BEFORE - Wrong pattern
const metadata = useProfile({ pubkey: video?.pubkey || '' })

// ✅ AFTER - Correct pattern
const metadata = useProfile(video?.pubkey ? { pubkey: video.pubkey } : undefined)
```

## Benefits

✅ **No Invalid Requests** - Relays no longer receive requests with empty authors  
✅ **Reduced Errors** - No more "bad req: filter item too small" notices  
✅ **Better Performance** - Avoids unnecessary relay requests  
✅ **Cleaner Logs** - Relay websocket logs are cleaner  
✅ **Early Return** - Hook returns early when data isn't available

## Technical Details

### Why Empty Strings Are Invalid

Nostr pubkeys are 64-character hex strings. An empty string is not a valid pubkey, and most relays reject filters with empty authors to prevent abuse.

### Why `undefined` Is Better Than `''`

- `undefined` - Clearly indicates "no value available"
- `''` - Empty string, could be mistaken for a valid value
- TypeScript's optional chaining (`?.`) returns `undefined`, not `''`

### Pattern Explanation

```typescript
// Breaking down the fix:
video?.pubkey // undefined if video is null/undefined
  ? { pubkey: video.pubkey } // If truthy, create ProfilePointer object
  : undefined // If falsy, pass undefined to hook
```

This ensures:

1. We only create a ProfilePointer when we have a valid pubkey
2. The hook receives `undefined` rather than an object with an empty pubkey
3. The validation in the hook provides an extra safety layer

## Testing

To verify the fix:

1. **Check Browser DevTools**
   - Open Network tab
   - Filter for WebSocket connections
   - Watch relay messages
   - Should see NO requests with `"authors":[""]`

2. **Check Relay Responses**
   - Should see NO "bad req" notices
   - All metadata requests should have valid 64-char hex pubkeys

3. **Check App Behavior**
   - Pages without loaded data should not make profile requests
   - Profile requests should only happen when pubkeys are available
   - No errors in console related to empty authors

## Related Issues

This pattern should be followed whenever using `useProfile`:

```typescript
// ✅ CORRECT patterns
const profile = useProfile(pubkey ? { pubkey } : undefined)
const profile = useProfile(user?.pubkey ? { pubkey: user.pubkey } : undefined)
const profile = useProfile(event ? { pubkey: event.pubkey } : undefined)

// ❌ WRONG patterns
const profile = useProfile({ pubkey: pubkey || '' })
const profile = useProfile({ pubkey: '' })
const profile = useProfile({ pubkey: undefined })
```

## Files Modified

1. `src/hooks/useProfile.ts` - Added validation for empty pubkeys
2. `src/pages/SinglePlaylistPage.tsx` - Fixed empty string fallback
3. `src/pages/VideoPage.tsx` - Fixed empty string fallback
4. `src/hooks/useCurrentUser.ts` - Fixed empty string fallback

## Verification

- ✅ TypeScript compilation passes
- ✅ Production build succeeds
- ✅ No invalid relay requests
- ✅ Profile loading still works correctly
- ✅ No errors when data is unavailable
