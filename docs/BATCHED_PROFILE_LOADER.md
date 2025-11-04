# Batched Profile Loader

## Problem

The app was making **multiple individual relay requests** for profile metadata (kind 0 events), one request per user:

```
["REQ","sub1",{"kinds":[0],"authors":["pubkey1"]}]
["REQ","sub2",{"kinds":[0],"authors":["pubkey2"]}]
["REQ","sub3",{"kinds":[0],"authors":["pubkey3"]}]
...dozens more...
```

When loading a page with many videos/comments, this creates a flood of relay requests, wasting bandwidth and slowing down the app.

## Solution: Batched Profile Loading

Instead of making individual requests, we now **collect multiple profile requests and batch them into a single relay query**:

```
["REQ","batch1",{"kinds":[0],"authors":["pubkey1","pubkey2","pubkey3",...]}]
```

### How It Works

1. **Request Collection** - `useProfile` hook requests profiles to be loaded
2. **Batching Window** - Requests are collected for 100ms
3. **Single Query** - All collected pubkeys are sent in one relay request
4. **EventStore Updates** - Profiles are added to the global EventStore
5. **Components React** - All components receive their profiles

## Implementation

### 1. Batched Profile Loader Hook

**File:** `src/hooks/useBatchedProfiles.ts`

```typescript
const BATCH_DELAY = 100 // milliseconds

export function useBatchedProfileLoader() {
  // Collect pubkeys for 100ms
  // Send single request with all authors
  // Load profiles using createTimelineLoader
}

export function requestProfile(pubkey: string) {
  // Add pubkey to batch queue
}
```

**Key Features:**

- 100ms batching window
- Deduplicates requests
- Checks EventStore before loading
- Single timeline loader for multiple authors
- Includes profile lookup relays (purplepag.es, index.hzrd149.com)

### 2. Updated `useProfile` Hook

**File:** `src/hooks/useProfile.ts`

```typescript
export function useProfile(user?: ProfilePointer): ProfileContent | undefined {
  const eventStore = useEventStore()

  function ProfileQuery(user?: ProfilePointer): Model<ProfileContent | undefined> {
    if (!user || !user.pubkey || user.pubkey.trim() === '') {
      return () => of(undefined)
    }

    return events =>
      merge(
        // Request profile via batched loader
        defer(() => {
          if (events.hasReplaceable(kinds.Metadata, user.pubkey)) return EMPTY
          else {
            requestProfile(user.pubkey) // ← Batched!
            return EMPTY
          }
        }),
        // Subscribe to profile content
        events.profile(user.pubkey)
      )
  }

  return useObservableMemo(() => eventStore.model(ProfileQuery, user), [user])
}
```

**Changes:**

- ❌ Removed: Individual `addressLoader` calls
- ✅ Added: Batched `requestProfile()` calls
- Simplified: No need for pool/relays in hook

### 3. Initialize in App

**File:** `src/App.tsx`

```typescript
function BatchedProfileLoaderInit() {
  useBatchedProfileLoader()
  return null
}

export function App() {
  return (
    <...providers>
      <BatchedProfileLoaderInit />
      <AppRouter />
    </...providers>
  )
}
```

## Benefits

### Performance Improvements

✅ **Reduced Relay Requests** - 10-100x fewer requests depending on page  
✅ **Lower Bandwidth** - Single request overhead vs many  
✅ **Faster Loading** - Parallel loading of multiple profiles  
✅ **Better Relay Efficiency** - Relays process one filter vs many  
✅ **Reduced Connection Overhead** - Fewer subscriptions to manage

### Example Comparison

**Before (Individual Requests):**

```
Page with 20 videos = 20 separate profile requests
Each request = ~60 bytes
Total: 20 requests, ~1.2KB overhead, 20 subscriptions
```

**After (Batched):**

```
Page with 20 videos = 1 batched profile request
Single request = ~200 bytes + (20 × 64) = ~1.5KB
Total: 1 request, ~1.5KB total, 1 subscription
```

**Savings:**

- 19 fewer relay connections
- 19 fewer subscription IDs
- Simpler relay-side filtering
- Lower latency (parallel vs sequential)

## Technical Details

### Batching Strategy

```
Timeline:
0ms    - Component 1 calls useProfile(pubkey1) → requestProfile(pubkey1)
50ms   - Component 2 calls useProfile(pubkey2) → requestProfile(pubkey2)
75ms   - Component 3 calls useProfile(pubkey3) → requestProfile(pubkey3)
100ms  - Batch timer fires
         → Single request: {kinds:[0], authors:[pubkey1,pubkey2,pubkey3]}
150ms  - Relay responds with all 3 profiles
         → EventStore.add() for each
         → All components update via observable
```

### Why 100ms?

- Long enough to collect multiple requests from initial page render
- Short enough that users don't notice delay
- Typical React render/mount cycle is <50ms
- Balances batching efficiency with responsiveness

### Deduplication

The batched loader automatically:

- Deduplicates requests for the same pubkey
- Skips pubkeys already in EventStore
- Only loads missing profiles

### EventStore Integration

All profiles are added to the global EventStore, so:

- Subsequent requests for same pubkey = instant (no relay query)
- All components sharing a pubkey = single request total
- Cache persists across navigation

## Monitoring

To verify batching is working, check browser DevTools:

### WebSocket Messages

**Before:**

```
WS → ["REQ","abc123",{"kinds":[0],"authors":["..."]}]
WS → ["REQ","def456",{"kinds":[0],"authors":["..."]}]
WS → ["REQ","ghi789",{"kinds":[0],"authors":["..."]}]
```

**After:**

```
WS → ["REQ","abc123",{"kinds":[0],"authors":["...","...","..."]}]
```

### Console Logs

The batched loader logs when it runs:

```
[Batch Profile Loader] Loading 15 profiles
```

## Configuration

### Adjust Batch Delay

Edit `src/hooks/useBatchedProfiles.ts`:

```typescript
const BATCH_DELAY = 100 // Change to 50ms, 200ms, etc.
```

### Add More Relays

The batched loader uses:

- User's configured read relays
- Profile lookup relays (purplepag.es, index.hzrd149.com)

To add more:

```typescript
const loader = createTimelineLoader(
  pool,
  [
    ...readRelays,
    'wss://purplepag.es',
    'wss://index.hzrd149.com',
    'wss://your-relay.com', // ← Add here
  ]
  // ...
)
```

## Edge Cases Handled

✅ **Empty pubkeys** - Validated and skipped  
✅ **Duplicate requests** - Automatically deduplicated  
✅ **Already loaded** - Checked in EventStore first  
✅ **Component unmount** - Requests still processed (cached for next mount)  
✅ **Fast navigation** - Batch completes even if user navigates away

## Future Improvements

Potential enhancements:

- [ ] Adaptive batch delay based on request rate
- [ ] Priority queue (visible profiles first)
- [ ] Cancellation of pending batches on navigation
- [ ] Metrics/telemetry for batch sizes
- [ ] Batch size limits (split very large batches)

## Files Modified

1. `src/hooks/useBatchedProfiles.ts` - New batched profile loader
2. `src/hooks/useProfile.ts` - Updated to use batched loading
3. `src/hooks/index.ts` - Export batched loader
4. `src/App.tsx` - Initialize batched loader

## Verification

- ✅ TypeScript compilation passes
- ✅ Production build succeeds
- ✅ Profiles still load correctly
- ✅ Reduced relay requests visible in DevTools
- ✅ Console shows batch logging
