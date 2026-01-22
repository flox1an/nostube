# Video Comment Notification System Design

**Date:** 2025-11-30
**Status:** Approved
**Author:** Design collaboration with user

## Overview

Add a notification system to nostube that alerts users when someone comments directly on their videos. The system will show a bell icon in the header with a dropdown list of notifications.

## User Requirements

- See notifications when users comment on my videos
- Click a notification to jump directly to that comment on the video page
- Notifications persist across sessions but clean up automatically
- Simple, unobtrusive UI with a dot indicator for unread items

## Design Decisions

### 1. Notification Scope

- **Only direct comments on user's videos** (not replies to other comments)
- Use NIP-22 `#P` tag query to find comments where user is the root pubkey (video author)
- Query: `{ kinds: [1111], '#P': [userPubkey], since: lastLoginTime }`

### 2. Persistence Strategy

- **Hybrid approach**: Store in localStorage with automatic cleanup
- Keep notifications since last login (not time-limited)
- Auto-prune notifications older than 7 days from localStorage
- Limit to 100 most recent notifications to prevent storage bloat

### 3. Read/Unread Behavior

- Notifications marked as read when clicked
- Clicking navigates to video page and scrolls to the specific comment
- Read notifications remain visible but are styled differently (slightly grayed out)

### 4. Visual Indicator

- Simple **red dot indicator** on bell icon (no count badge)
- Dot only shows when there are unread notifications
- Clean, minimal design that doesn't distract

### 5. Update Mechanism

- **Polling every 2.5 minutes** (150 seconds)
- No real-time WebSocket subscription (simpler, less resource intensive)
- Poll uses `since` timestamp of most recent notification to avoid fetching duplicates

### 6. Time Window

- **Since last login**: Show all notifications from when user last logged in
- Track `lastLoginTime` in localStorage, update on each login
- Ensures users never miss notifications regardless of how long they were away

### 7. Dropdown UI

- **Show all notifications** with overflow scroll
- Max height: `80dvh` for responsive design
- No pagination or "view all" page - keep it simple

## Data Model

### VideoNotification Interface

```typescript
interface VideoNotification {
  id: string // comment event ID
  commentId: string // same as id, for clarity
  videoId: string // the video that was commented on
  videoTitle?: string // cached video title
  commenterPubkey: string // who commented
  commentContent: string // what they said (first 100 chars)
  timestamp: number // when (created_at)
  read: boolean // read status
  videoEventId: string // for navigation (nevent or naddr)
}
```

### localStorage Structure

```typescript
{
  lastLoginTime: number,         // timestamp of last login
  notifications: VideoNotification[],
  lastFetchTime: number          // for polling logic
}
```

## Architecture

### Components

1. **NotificationBell** (in Header)
   - Bell icon with conditional dot indicator
   - Dropdown menu using shadcn/ui DropdownMenu
   - Only visible when user is logged in
   - Positioned between search bar and upload button

2. **NotificationItem**
   - Avatar (32x32)
   - Text: "{USERNAME} commented on your video"
   - Video title (truncated)
   - Relative time (formatDistance from date-fns)
   - Click handler for navigation and mark-as-read
   - Different styling for read vs unread

3. **NotificationDropdown**
   - Scrollable container (max-h-[80dvh])
   - Empty state: "No new notifications"
   - List of NotificationItem components

### Hooks

**useNotifications**

- Manages notification state
- Handles localStorage persistence
- Implements polling logic
- Provides methods: `markAsRead()`, `fetchNotifications()`
- Returns: `{ notifications, unreadCount, markAsRead, isLoading }`

**useLoginTimeTracking**

- Tracks when user logs in
- Updates `lastLoginTime` in localStorage
- Integrates with existing `useCurrentUser` hook

## Implementation Details

### Notification Fetching Flow

1. On mount:
   - Load notifications from localStorage
   - Check if user is logged in
   - Start polling interval

2. On each poll (every 2.5 minutes):
   - Fetch comments using Nostr filter with `since: lastLoginTime`
   - For each new comment:
     - Extract video ID from 'E' tag
     - Fetch video metadata from eventStore
     - Extract video title
     - Create VideoNotification object
   - Merge with existing notifications (deduplicate by ID)
   - Save to localStorage
   - Update UI

3. On user interaction:
   - Click notification → mark as read → navigate to video#comment
   - Batch localStorage updates (debounced)

### Comment Navigation & Highlighting

When navigating to `/v/{eventId}#comment-{commentId}`:

1. VideoPage reads hash from URL
2. Add `id="comment-{commentId}"` to CommentItem div
3. After render, scroll to comment: `element.scrollIntoView({ behavior: 'smooth', block: 'center' })`
4. Apply highlight animation (yellow/blue background fade for 2-3 seconds)

### Polling Logic

```typescript
useEffect(() => {
  if (!user) return

  const pollInterval = setInterval(() => {
    fetchNotifications()
  }, 150000) // 2.5 minutes

  // Initial fetch
  fetchNotifications()

  return () => clearInterval(pollInterval)
}, [user, fetchNotifications])
```

### localStorage Cleanup

```typescript
function cleanupOldNotifications(notifications: VideoNotification[]) {
  const sevenDaysAgo = Date.now() / 1000 - 7 * 24 * 60 * 60
  return notifications
    .filter(n => n.timestamp > sevenDaysAgo)
    .slice(0, 100) // Keep max 100 notifications
    .sort((a, b) => b.timestamp - a.timestamp)
}
```

## Error Handling

### Graceful Degradation

- Video metadata fails → show "Unknown video"
- Profile fails to load → show truncated pubkey
- Relay connection fails → retry with exponential backoff
- Show toast notification on persistent errors

### Edge Cases

- **Deleted video**: Notification stays, links to 404 (show graceful error)
- **Deleted comment**: Keep notification, show "[deleted]" state
- **Multiple tabs**: Use localStorage events to sync read state
- **Clock skew**: Use event `created_at` from relays, not local time

## Performance Optimizations

1. **Memoization**: Memoize notification list to prevent re-renders
2. **Batched writes**: Debounce localStorage updates (500ms)
3. **Limit storage**: Max 100 notifications, auto-prune older
4. **Efficient queries**: Use `since` parameter to minimize relay traffic
5. **Lazy loading**: Only fetch video metadata for visible notifications

## Testing Strategy

### Unit Tests

- [ ] VideoNotification data model validation
- [ ] localStorage persistence and retrieval
- [ ] Cleanup logic (7-day limit, 100 item limit)
- [ ] Mark-as-read functionality
- [ ] Deduplication logic

### Integration Tests

- [ ] Polling interval starts/stops correctly
- [ ] Notifications fetch on login
- [ ] Navigation to comment works
- [ ] Multi-tab synchronization via localStorage events
- [ ] Empty state displays correctly

### Manual Testing

- [ ] Create test comment on own video, verify notification appears
- [ ] Click notification, verify navigation to comment
- [ ] Verify dot indicator shows/hides correctly
- [ ] Test across browser refresh
- [ ] Test logout/login flow

## UI Mockup

```
Header:
┌─────────────────────────────────────────────────────────┐
│ [☰] nostube    [Search]      [🔔●] [Upload] [Login]    │
└─────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                   ┌──────────────────────────────┐
                   │ Notifications            [×] │
                   ├──────────────────────────────┤
                   │ [👤] alice: commented on    │
                   │      your video             │
                   │      "Bitcoin Explained"    │
                   │      2 hours ago            │
                   ├──────────────────────────────┤
                   │ [👤] bob: commented on      │
                   │      your video             │
                   │      "Nostr Tutorial"       │
                   │      1 day ago              │
                   ├──────────────────────────────┤
                   │ ...                          │
                   └──────────────────────────────┘
                   (max-h-80dvh with scroll)
```

## Migration & Rollout

### Phase 1: Core Implementation

- Implement `useNotifications` hook
- Add NotificationBell to Header
- Basic localStorage persistence
- Manual testing

### Phase 2: Polish & Error Handling

- Add comment highlighting/scrolling
- Implement error handling
- Add loading states
- Multi-tab sync

### Phase 3: Testing & Refinement

- Write comprehensive tests
- Performance optimization
- User feedback iteration

## Open Questions & Future Enhancements

### Future Considerations (Out of Scope)

- Push notifications (browser API)
- Email notifications
- Notification preferences/settings
- Mute specific videos
- Notification categories (likes, reposts, mentions)
- Mark all as read button
- Notification sounds

### Deferred Decisions

- Should we show comment preview text? (Currently yes, first 100 chars)
- Should we group notifications by video? (Currently no, keep simple)
- Should we support keyboard navigation in dropdown? (Nice to have)

## Success Metrics

- Users can see when someone comments on their videos
- Notification appears within 2.5 minutes of comment being posted
- Click-through rate from notification to video page
- Zero data loss on browser refresh
- Performance: <100ms to open dropdown, <500ms to load notifications

## References

- [NIP-22: Comment](https://github.com/nostr-protocol/nips/blob/master/22.md)
- [NIP-01: Basic protocol flow](https://github.com/nostr-protocol/nips/blob/master/01.md)
- Existing VideoComments component: `src/components/VideoComments.tsx`
- Existing useCommentCount hook: `src/hooks/useCommentCount.ts`
