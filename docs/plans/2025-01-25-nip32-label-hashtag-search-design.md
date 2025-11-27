# NIP-32 Label-Enhanced Hashtag Discovery

**Date:** 2025-01-25
**Status:** Design Complete
**Author:** Claude Code

## Overview

Enhance the `/tag/:tag` page to discover videos tagged via NIP-32 labels in addition to videos with native hashtags. This provides better content discovery by including community-labeled videos.

## Problem Statement

Currently, `/tag/bitcoin` only shows videos that included `#bitcoin` in their original tags at publish time. Videos that are later labeled with `#bitcoin` by the community (via NIP-32 kind 1985 events) are not discoverable through hashtag navigation.

## Solution

Implement parallel query system that:

1. Queries videos with native `#t` tags (existing behavior)
2. Queries kind 1985 label events with the hashtag
3. Extracts video IDs from label events
4. Fetches those videos and merges them with native results
5. Deduplicates by event ID and sorts by timestamp

## Architecture

### Query Flow

```
User visits /tag/bitcoin
  ↓
Query 1 (native): kinds=[21,22,34235,34236], #t=["bitcoin"]
  ↓ (displays immediately)
Query 2 (background): kind=1985, #t=["bitcoin"]
  ↓ (extract e tags)
Query 3 (background): ids=[extracted video IDs]
  ↓ (merge and dedupe)
Update display silently
```

### Components

**HashtagPage** (`src/pages/HashtagPage.tsx`)

- UI remains unchanged
- Replaces `useTimelineLoader` with `useHashtagVideos`

**useHashtagVideos** (`src/hooks/useHashtagVideos.ts`)

- New hook handling parallel queries and merging
- ~150-200 lines

**Key Features:**

- Background label loading (non-blocking)
- Silent merge as labeled videos arrive
- EventStore caching for all queries
- Graceful degradation if label queries fail

## Implementation Details

### State Management

```typescript
interface UseHashtagVideosState {
  nativeVideos: VideoEvent[] // From native #t tags
  labeledVideoIds: Set<string> // Video IDs from labels
  labeledVideos: VideoEvent[] // Fetched labeled videos
  mergedVideos: VideoEvent[] // Deduplicated & sorted
  loading: boolean // Only for native query
  loadingLabels: boolean // Background label query
}
```

### Query Phases

**Phase 1 - Native Tags (immediate):**

```typescript
const nativeLoader = createTimelineLoader(
  pool,
  relays,
  [{ kinds: [21, 22, 34235, 34236], '#t': [tag.toLowerCase()] }],
  { eventStore }
)
```

**Phase 2 - Label Events (background):**

```typescript
const labelLoader = createTimelineLoader(
  pool,
  relays,
  [{ kinds: [1985], '#t': [tag.toLowerCase()], limit: 100 }],
  { eventStore }
)
```

**Phase 3 - Labeled Videos (background):**

```typescript
function extractVideoIds(labelEvents: NostrEvent[]): string[] {
  const ids = new Set<string>()
  labelEvents.forEach(event => {
    event.tags.filter(tag => tag[0] === 'e').forEach(tag => ids.add(tag[1]))
  })
  return Array.from(ids)
}

// Fetch videos by extracted IDs using createEventLoader
```

### Merge Logic

```typescript
const merged = useMemo(() => {
  // Use Map for O(1) deduplication
  const videoMap = new Map<string, VideoEvent>()

  // Add native videos first
  nativeVideos.forEach(v => videoMap.set(v.id, v))

  // Add labeled videos (skips if already exists)
  labeledVideos.forEach(v => {
    if (!videoMap.has(v.id)) videoMap.set(v.id, v)
  })

  // Sort by timestamp descending
  return Array.from(videoMap.values()).sort((a, b) => b.created_at - a.created_at)
}, [nativeVideos, labeledVideos])
```

## Error Handling

### Native Query Fails

- **Action:** Show error message to user (critical path)
- **Impact:** Don't start label queries (no baseline to enhance)

### Label Query Fails

- **Action:** Silent failure, log to console
- **Impact:** User still sees native-tagged videos (graceful degradation)

### Labeled Video Fetch Fails

- **Action:** Skip failed videos, merge what succeeded
- **Impact:** Silent - user gets partial enhancement

## Performance Optimizations

### Debouncing

- Wait 500ms after native results before starting label query
- Prevents unnecessary queries if user navigates away quickly

### Batch Fetching

- If labels reference 100+ videos, batch into groups of 20
- Prevents overwhelming relays with massive single query

### Caching

- EventStore automatically caches all events
- Label query results cached for 5 minutes
- Avoids re-querying on page revisit

### Deduplication Optimization

- Use Map for O(1) lookup vs O(n) array filtering
- Single pass through videos for merge operation

## Relay Selection

Uses **user's configured relays** for all queries:

- Consistent with rest of application
- Respects user's relay preferences
- Native videos and labels likely on same relays

## User Experience

### Loading States

- **Initial load:** Shows native-tagged videos immediately
- **Background:** Silently fetches and merges labeled videos
- **No blocking:** User can interact with native results right away
- **No flickering:** Results update smoothly as labels arrive

### Result Presentation

- **Deduplication:** Videos appearing in both sources shown once
- **No badges:** Clean presentation without source indication
- **Sorting:** All videos sorted by timestamp (newest first)
- **Consistent:** Same UX as other timeline pages

## Testing Strategy

### Unit Tests

- Merge logic with duplicate videos
- Deduplication edge cases
- Sort order verification
- Video ID extraction from labels

### Integration Tests

- Mock native video events
- Mock label events with `e` tags
- Verify correct merge behavior
- Test error handling paths

### Manual Testing

1. Create test video with native `#test` tag
2. Publish label event (kind 1985) with `#test` referencing different video
3. Visit `/tag/test`
4. Verify both videos appear
5. Verify no duplicates if same video has both native tag and label

## Rollout Plan

### No Feature Flag Needed

- Graceful degradation built-in
- If label queries fail, native results still work
- No breaking changes to existing functionality

### Deployment Steps

1. Add `useHashtagVideos` hook
2. Update HashtagPage to use new hook
3. Deploy to production
4. Monitor relay performance and error rates

## Future Enhancements

### Potential Additions (Not in Scope)

- Show label count per video
- Filter by label author
- Sort by label popularity
- Label author reputation weighting

### Why Deferred

- Keep initial implementation simple
- Validate parallel query approach first
- Gather usage data before adding complexity

## Success Metrics

- Native query performance unchanged
- Label queries complete within 2-3 seconds
- No increase in error rates
- Increased video discovery (measure via analytics)

## Implementation Checklist

- [ ] Create `src/hooks/useHashtagVideos.ts`
- [ ] Implement native video query phase
- [ ] Implement label event query phase
- [ ] Implement labeled video fetch phase
- [ ] Implement merge and deduplication logic
- [ ] Add error handling for all query phases
- [ ] Update `src/pages/HashtagPage.tsx`
- [ ] Write unit tests for merge logic
- [ ] Write integration tests
- [ ] Manual testing with test labels
- [ ] Performance testing with large result sets
- [ ] Documentation updates
