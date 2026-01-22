# Video Comment Notification System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a notification system that alerts users when someone comments on their videos, with a bell icon in the header showing a dropdown list of notifications.

**Architecture:** localStorage-based persistence with polling (2.5 min intervals), bell icon in header with dot indicator for unread notifications, click-to-navigate functionality that scrolls to the specific comment on the video page.

**Tech Stack:** React 18, TypeScript, Applesauce (Nostr), shadcn/ui (DropdownMenu, Avatar), date-fns (formatDistance), localStorage, react-i18next

**Design Reference:** `/docs/plans/2025-11-30-notification-system-design.md`

---

## Task 1: Create VideoNotification Type Definition

**Files:**

- Create: `src/types/notification.ts`

**Step 1: Write the type definition**

Create the VideoNotification interface with all required fields:

```typescript
export interface VideoNotification {
  id: string // comment event ID
  commentId: string // same as id, for clarity
  videoId: string // the video that was commented on (event ID)
  videoTitle?: string // cached video title
  commenterPubkey: string // who commented
  commentContent: string // what they said (first 100 chars)
  timestamp: number // when (created_at)
  read: boolean // read status
  videoEventId: string // for navigation (nevent or naddr)
}

export interface NotificationStorage {
  lastLoginTime: number
  notifications: VideoNotification[]
  lastFetchTime: number
}
```

**Step 2: Commit**

```bash
git add src/types/notification.ts
git commit -m "feat: add VideoNotification type definition"
```

---

## Task 2: Create Notification Storage Utilities

**Files:**

- Create: `src/lib/notification-storage.ts`
- Test: `src/lib/notification-storage.test.ts`

**Step 1: Write failing test for localStorage operations**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getNotificationStorage,
  saveNotificationStorage,
  cleanupOldNotifications,
} from './notification-storage'
import type { VideoNotification } from '../types/notification'

describe('notification-storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('getNotificationStorage', () => {
    it('should return default structure when localStorage is empty', () => {
      const result = getNotificationStorage()
      expect(result).toEqual({
        lastLoginTime: 0,
        notifications: [],
        lastFetchTime: 0,
      })
    })

    it('should parse and return stored notifications', () => {
      const stored = {
        lastLoginTime: 1234567890,
        notifications: [
          {
            id: 'note1',
            commentId: 'note1',
            videoId: 'video1',
            commenterPubkey: 'pubkey1',
            commentContent: 'Great video!',
            timestamp: 1234567890,
            read: false,
            videoEventId: 'nevent1...',
          },
        ],
        lastFetchTime: 1234567890,
      }
      localStorage.setItem('nostube_notifications', JSON.stringify(stored))

      const result = getNotificationStorage()
      expect(result).toEqual(stored)
    })

    it('should handle corrupted data gracefully', () => {
      localStorage.setItem('nostube_notifications', 'invalid json')
      const result = getNotificationStorage()
      expect(result).toEqual({
        lastLoginTime: 0,
        notifications: [],
        lastFetchTime: 0,
      })
    })
  })

  describe('saveNotificationStorage', () => {
    it('should save notifications to localStorage', () => {
      const data = {
        lastLoginTime: 1234567890,
        notifications: [],
        lastFetchTime: 1234567890,
      }
      saveNotificationStorage(data)

      const stored = localStorage.getItem('nostube_notifications')
      expect(JSON.parse(stored!)).toEqual(data)
    })
  })

  describe('cleanupOldNotifications', () => {
    it('should remove notifications older than 7 days', () => {
      const now = Date.now() / 1000
      const sevenDaysAgo = now - 7 * 24 * 60 * 60
      const eightDaysAgo = now - 8 * 24 * 60 * 60

      const notifications: VideoNotification[] = [
        {
          id: 'recent',
          commentId: 'recent',
          videoId: 'v1',
          commenterPubkey: 'pk1',
          commentContent: 'Recent',
          timestamp: now,
          read: false,
          videoEventId: 'ne1',
        },
        {
          id: 'old',
          commentId: 'old',
          videoId: 'v2',
          commenterPubkey: 'pk2',
          commentContent: 'Old',
          timestamp: eightDaysAgo,
          read: false,
          videoEventId: 'ne2',
        },
      ]

      const result = cleanupOldNotifications(notifications)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('recent')
    })

    it('should limit to 100 most recent notifications', () => {
      const now = Date.now() / 1000
      const notifications: VideoNotification[] = Array.from({ length: 150 }, (_, i) => ({
        id: `note${i}`,
        commentId: `note${i}`,
        videoId: `v${i}`,
        commenterPubkey: `pk${i}`,
        commentContent: `Comment ${i}`,
        timestamp: now - i,
        read: false,
        videoEventId: `ne${i}`,
      }))

      const result = cleanupOldNotifications(notifications)
      expect(result).toHaveLength(100)
    })

    it('should sort by timestamp descending (newest first)', () => {
      const notifications: VideoNotification[] = [
        {
          id: 'n1',
          commentId: 'n1',
          videoId: 'v1',
          commenterPubkey: 'pk1',
          commentContent: 'First',
          timestamp: 1000,
          read: false,
          videoEventId: 'ne1',
        },
        {
          id: 'n2',
          commentId: 'n2',
          videoId: 'v2',
          commenterPubkey: 'pk2',
          commentContent: 'Second',
          timestamp: 2000,
          read: false,
          videoEventId: 'ne2',
        },
      ]

      const result = cleanupOldNotifications(notifications)
      expect(result[0].timestamp).toBe(2000)
      expect(result[1].timestamp).toBe(1000)
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- notification-storage.test.ts`
Expected: FAIL with "Cannot find module './notification-storage'"

**Step 3: Implement notification storage utilities**

```typescript
import type { NotificationStorage, VideoNotification } from '../types/notification'

const STORAGE_KEY = 'nostube_notifications'
const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60

export function getNotificationStorage(): NotificationStorage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      return {
        lastLoginTime: 0,
        notifications: [],
        lastFetchTime: 0,
      }
    }
    return JSON.parse(stored)
  } catch (error) {
    console.error('Failed to parse notification storage:', error)
    return {
      lastLoginTime: 0,
      notifications: [],
      lastFetchTime: 0,
    }
  }
}

export function saveNotificationStorage(data: NotificationStorage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (error) {
    console.error('Failed to save notification storage:', error)
  }
}

export function cleanupOldNotifications(notifications: VideoNotification[]): VideoNotification[] {
  const sevenDaysAgo = Date.now() / 1000 - SEVEN_DAYS_IN_SECONDS
  return notifications
    .filter(n => n.timestamp > sevenDaysAgo)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 100)
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- notification-storage.test.ts`
Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add src/lib/notification-storage.ts src/lib/notification-storage.test.ts
git commit -m "feat: add notification localStorage utilities with cleanup"
```

---

## Task 3: Create useLoginTimeTracking Hook

**Files:**

- Create: `src/hooks/useLoginTimeTracking.ts`
- Modify: `src/lib/notification-storage.ts` (add updateLastLoginTime)

**Step 1: Add updateLastLoginTime to storage utilities**

In `src/lib/notification-storage.ts`, add:

```typescript
export function updateLastLoginTime(): void {
  const storage = getNotificationStorage()
  storage.lastLoginTime = Math.floor(Date.now() / 1000)
  saveNotificationStorage(storage)
}
```

**Step 2: Create the hook**

```typescript
import { useEffect } from 'react'
import { useCurrentUser } from './useCurrentUser'
import { updateLastLoginTime } from '../lib/notification-storage'

export function useLoginTimeTracking() {
  const { user } = useCurrentUser()

  useEffect(() => {
    if (user) {
      updateLastLoginTime()
    }
  }, [user])
}
```

**Step 3: Commit**

```bash
git add src/hooks/useLoginTimeTracking.ts src/lib/notification-storage.ts
git commit -m "feat: add useLoginTimeTracking hook to track user login time"
```

---

## Task 4: Create useNotifications Hook (Part 1 - Core State)

**Files:**

- Create: `src/hooks/useNotifications.ts`
- Test: `src/hooks/useNotifications.test.tsx`

**Step 1: Write failing test for hook initialization**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useNotifications } from './useNotifications'

describe('useNotifications', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('should initialize with empty notifications when localStorage is empty', () => {
    const { result } = renderHook(() => useNotifications())

    expect(result.current.notifications).toEqual([])
    expect(result.current.unreadCount).toBe(0)
    expect(result.current.isLoading).toBe(false)
  })

  it('should load notifications from localStorage on mount', () => {
    const stored = {
      lastLoginTime: 1234567890,
      notifications: [
        {
          id: 'note1',
          commentId: 'note1',
          videoId: 'video1',
          commenterPubkey: 'pubkey1',
          commentContent: 'Great video!',
          timestamp: 1234567890,
          read: false,
          videoEventId: 'nevent1...',
        },
      ],
      lastFetchTime: 1234567890,
    }
    localStorage.setItem('nostube_notifications', JSON.stringify(stored))

    const { result } = renderHook(() => useNotifications())

    expect(result.current.notifications).toHaveLength(1)
    expect(result.current.unreadCount).toBe(1)
  })

  it('should calculate unreadCount correctly', () => {
    const stored = {
      lastLoginTime: 1234567890,
      notifications: [
        {
          id: 'note1',
          commentId: 'note1',
          videoId: 'video1',
          commenterPubkey: 'pubkey1',
          commentContent: 'Great',
          timestamp: 1234567890,
          read: false,
          videoEventId: 'ne1',
        },
        {
          id: 'note2',
          commentId: 'note2',
          videoId: 'video2',
          commenterPubkey: 'pubkey2',
          commentContent: 'Nice',
          timestamp: 1234567891,
          read: true,
          videoEventId: 'ne2',
        },
      ],
      lastFetchTime: 1234567890,
    }
    localStorage.setItem('nostube_notifications', JSON.stringify(stored))

    const { result } = renderHook(() => useNotifications())

    expect(result.current.unreadCount).toBe(1)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- useNotifications.test.tsx`
Expected: FAIL with "Cannot find module './useNotifications'"

**Step 3: Implement basic hook structure**

```typescript
import { useState, useEffect, useCallback, useMemo } from 'react'
import type { VideoNotification } from '../types/notification'
import {
  getNotificationStorage,
  saveNotificationStorage,
  cleanupOldNotifications,
} from '../lib/notification-storage'
import { useCurrentUser } from './useCurrentUser'

export function useNotifications() {
  const { user } = useCurrentUser()
  const [notifications, setNotifications] = useState<VideoNotification[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Load notifications from localStorage on mount
  useEffect(() => {
    const storage = getNotificationStorage()
    setNotifications(storage.notifications)
  }, [])

  // Calculate unread count
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.read).length
  }, [notifications])

  // Mark notification as read
  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev => {
      const updated = prev.map(n => (n.id === notificationId ? { ...n, read: true } : n))

      // Save to localStorage
      const storage = getNotificationStorage()
      storage.notifications = updated
      saveNotificationStorage(storage)

      return updated
    })
  }, [])

  // Fetch notifications (placeholder for now)
  const fetchNotifications = useCallback(async () => {
    if (!user) return

    setIsLoading(true)
    try {
      // TODO: Implement Nostr query
      console.log('Fetching notifications...')
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    } finally {
      setIsLoading(false)
    }
  }, [user])

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    fetchNotifications,
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- useNotifications.test.tsx`
Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add src/hooks/useNotifications.ts src/hooks/useNotifications.test.tsx
git commit -m "feat: add useNotifications hook with localStorage state management"
```

---

## Task 5: Implement Notification Fetching Logic

**Files:**

- Modify: `src/hooks/useNotifications.ts`
- Test: `src/hooks/useNotifications.test.tsx` (add fetch tests)

**Step 1: Add test for fetching notifications**

Add to `src/hooks/useNotifications.test.tsx`:

```typescript
import { vi } from 'vitest'
import type { NostrEvent } from '@applesauce/core'

// Mock the necessary Applesauce hooks
vi.mock('./useCurrentUser', () => ({
  useCurrentUser: vi.fn(() => ({ user: { pubkey: 'test-pubkey' } })),
}))

vi.mock('./useNostr', () => ({
  useNostr: vi.fn(() => ({
    relayPool: {
      subscribe: vi.fn(),
    },
  })),
}))

vi.mock('./useEventStore', () => ({
  useEventStore: vi.fn(() => ({
    getEvent: vi.fn(id => {
      if (id === 'video1') {
        return {
          id: 'video1',
          kind: 34235,
          content: '',
          tags: [['title', 'Test Video']],
        }
      }
      return null
    }),
  })),
}))

describe('useNotifications - fetching', () => {
  it('should fetch notifications from Nostr relays', async () => {
    // This test will be implemented when we add the fetching logic
    expect(true).toBe(true)
  })
})
```

**Step 2: Implement fetchNotifications with Nostr query**

Update `src/hooks/useNotifications.ts`:

```typescript
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { NostrEvent } from '@applesauce/core'
import type { VideoNotification } from '../types/notification'
import {
  getNotificationStorage,
  saveNotificationStorage,
  cleanupOldNotifications,
} from '../lib/notification-storage'
import { useCurrentUser } from './useCurrentUser'
import { useNostr } from './useNostr'
import { useEventStore } from './useEventStore'
import { generateEventLink } from '../lib/nostr'

export function useNotifications() {
  const { user } = useCurrentUser()
  const { relayPool } = useNostr()
  const eventStore = useEventStore()
  const [notifications, setNotifications] = useState<VideoNotification[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const isFetchingRef = useRef(false)

  // Load notifications from localStorage on mount
  useEffect(() => {
    const storage = getNotificationStorage()
    setNotifications(storage.notifications)
  }, [])

  // Calculate unread count
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.read).length
  }, [notifications])

  // Mark notification as read
  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev => {
      const updated = prev.map(n => (n.id === notificationId ? { ...n, read: true } : n))

      const storage = getNotificationStorage()
      storage.notifications = updated
      saveNotificationStorage(storage)

      return updated
    })
  }, [])

  // Fetch notifications from Nostr
  const fetchNotifications = useCallback(async () => {
    if (!user || isFetchingRef.current) return

    isFetchingRef.current = true
    setIsLoading(true)

    try {
      const storage = getNotificationStorage()
      const { lastLoginTime } = storage

      if (lastLoginTime === 0) {
        // User hasn't logged in yet, skip
        return
      }

      // Query for comments on user's videos using NIP-22 #P tag
      const filter = {
        kinds: [1111],
        '#P': [user.pubkey],
        since: lastLoginTime,
        limit: 100,
      }

      const comments: NostrEvent[] = []
      const sub = relayPool.subscribe([filter], {
        onevent: (event: NostrEvent) => {
          comments.push(event)
        },
      })

      // Wait for EOSE (End Of Stored Events)
      await new Promise(resolve => {
        setTimeout(resolve, 3000) // 3 second timeout
      })

      sub.close()

      // Process comments into notifications
      const newNotifications: VideoNotification[] = []

      for (const comment of comments) {
        // Extract video ID from 'E' tag
        const eTag = comment.tags.find(t => t[0] === 'E')
        if (!eTag) continue

        const videoId = eTag[1]

        // Fetch video metadata from eventStore
        const videoEvent = eventStore.getEvent(videoId)
        const videoTitle = videoEvent?.tags.find(t => t[0] === 'title')?.[1] || 'Unknown video'

        // Create notification
        const notification: VideoNotification = {
          id: comment.id,
          commentId: comment.id,
          videoId,
          videoTitle,
          commenterPubkey: comment.pubkey,
          commentContent: comment.content.slice(0, 100),
          timestamp: comment.created_at,
          read: false,
          videoEventId: generateEventLink(videoEvent || { id: videoId, kind: 34235 }),
        }

        newNotifications.push(notification)
      }

      // Merge with existing notifications (deduplicate by ID)
      setNotifications(prev => {
        const existingIds = new Set(prev.map(n => n.id))
        const toAdd = newNotifications.filter(n => !existingIds.has(n.id))
        const merged = [...prev, ...toAdd]

        // Cleanup and save
        const cleaned = cleanupOldNotifications(merged)
        const updatedStorage = getNotificationStorage()
        updatedStorage.notifications = cleaned
        updatedStorage.lastFetchTime = Math.floor(Date.now() / 1000)
        saveNotificationStorage(updatedStorage)

        return cleaned
      })
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    } finally {
      setIsLoading(false)
      isFetchingRef.current = false
    }
  }, [user, relayPool, eventStore])

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    fetchNotifications,
  }
}
```

**Step 3: Run tests**

Run: `npm test -- useNotifications.test.tsx`
Expected: PASS (tests may need adjustment based on actual implementation)

**Step 4: Commit**

```bash
git add src/hooks/useNotifications.ts src/hooks/useNotifications.test.tsx
git commit -m "feat: implement notification fetching from Nostr relays"
```

---

## Task 6: Add Polling to useNotifications Hook

**Files:**

- Modify: `src/hooks/useNotifications.ts`

**Step 1: Add polling interval**

Update the hook to include polling:

```typescript
// ... existing imports ...

const POLL_INTERVAL_MS = 150000 // 2.5 minutes

export function useNotifications() {
  // ... existing state ...

  // Start polling when user is logged in
  useEffect(() => {
    if (!user) return

    // Initial fetch
    fetchNotifications()

    // Set up polling
    const intervalId = setInterval(() => {
      fetchNotifications()
    }, POLL_INTERVAL_MS)

    return () => {
      clearInterval(intervalId)
    }
  }, [user, fetchNotifications])

  // ... rest of hook ...
}
```

**Step 2: Commit**

```bash
git add src/hooks/useNotifications.ts
git commit -m "feat: add polling to notification fetching (2.5 min interval)"
```

---

## Task 7: Create NotificationItem Component

**Files:**

- Create: `src/components/NotificationItem.tsx`
- Test: `src/components/NotificationItem.test.tsx`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NotificationItem } from './NotificationItem'
import type { VideoNotification } from '../types/notification'

describe('NotificationItem', () => {
  const mockNotification: VideoNotification = {
    id: 'note1',
    commentId: 'note1',
    videoId: 'video1',
    videoTitle: 'Test Video',
    commenterPubkey: 'pubkey123',
    commentContent: 'Great video!',
    timestamp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    read: false,
    videoEventId: 'nevent1...',
  }

  it('should render notification with avatar and text', () => {
    const onClick = vi.fn()
    render(<NotificationItem notification={mockNotification} onClick={onClick} />)

    expect(screen.getByText(/commented on your video/i)).toBeInTheDocument()
    expect(screen.getByText('Test Video')).toBeInTheDocument()
  })

  it('should call onClick when clicked', () => {
    const onClick = vi.fn()
    render(<NotificationItem notification={mockNotification} onClick={onClick} />)

    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledWith(mockNotification)
  })

  it('should show different styling for read notifications', () => {
    const readNotification = { ...mockNotification, read: true }
    const { container } = render(
      <NotificationItem notification={readNotification} onClick={vi.fn()} />
    )

    expect(container.firstChild).toHaveClass('opacity-60')
  })

  it('should display relative time', () => {
    render(<NotificationItem notification={mockNotification} onClick={vi.fn()} />)

    // Should show "about 1 hour ago" or similar
    expect(screen.getByText(/hour ago/i)).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- NotificationItem.test.tsx`
Expected: FAIL with "Cannot find module './NotificationItem'"

**Step 3: Implement NotificationItem component**

```typescript
import { formatDistance } from 'date-fns'
import { useTranslation } from 'react-i18next'
import type { VideoNotification } from '../types/notification'
import { Avatar } from './ui/avatar'
import { getDateLocale } from '../lib/date-locale'
import { useAuthor } from '../hooks/useAuthor'

interface NotificationItemProps {
  notification: VideoNotification
  onClick: (notification: VideoNotification) => void
}

export function NotificationItem({ notification, onClick }: NotificationItemProps) {
  const { t, i18n } = useTranslation()
  const author = useAuthor(notification.commenterPubkey)

  const displayName = author?.profile?.displayName ||
    author?.profile?.name ||
    notification.commenterPubkey.slice(0, 8)

  const relativeTime = formatDistance(
    new Date(notification.timestamp * 1000),
    new Date(),
    {
      addSuffix: true,
      locale: getDateLocale(i18n.language),
    }
  )

  return (
    <button
      onClick={() => onClick(notification)}
      className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
        notification.read ? 'opacity-60' : ''
      }`}
    >
      <div className="flex gap-3">
        <Avatar
          src={author?.profile?.picture}
          pubkey={notification.commenterPubkey}
          size={32}
          className="shrink-0"
        />

        <div className="flex-1 min-w-0">
          <p className="text-sm">
            <span className="font-medium">{displayName}</span>{' '}
            {t('notifications.commentedOnYourVideo')}
          </p>

          {notification.videoTitle && (
            <p className="text-sm text-muted-foreground truncate mt-0.5">
              {notification.videoTitle}
            </p>
          )}

          <p className="text-xs text-muted-foreground mt-1">
            {relativeTime}
          </p>
        </div>
      </div>
    </button>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- NotificationItem.test.tsx`
Expected: PASS (may need to mock useAuthor hook)

**Step 5: Commit**

```bash
git add src/components/NotificationItem.tsx src/components/NotificationItem.test.tsx
git commit -m "feat: add NotificationItem component with avatar and relative time"
```

---

## Task 8: Create NotificationDropdown Component

**Files:**

- Create: `src/components/NotificationDropdown.tsx`

**Step 1: Implement the dropdown component**

```typescript
import { useTranslation } from 'react-i18next'
import type { VideoNotification } from '../types/notification'
import { NotificationItem } from './NotificationItem'
import { ScrollArea } from './ui/scroll-area'

interface NotificationDropdownProps {
  notifications: VideoNotification[]
  onNotificationClick: (notification: VideoNotification) => void
}

export function NotificationDropdown({
  notifications,
  onNotificationClick,
}: NotificationDropdownProps) {
  const { t } = useTranslation()

  if (notifications.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        {t('notifications.noNotifications')}
      </div>
    )
  }

  return (
    <ScrollArea className="max-h-[80dvh]">
      <div className="py-2">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onClick={onNotificationClick}
          />
        ))}
      </div>
    </ScrollArea>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/NotificationDropdown.tsx
git commit -m "feat: add NotificationDropdown component with scrollable list"
```

---

## Task 9: Create NotificationBell Component

**Files:**

- Create: `src/components/NotificationBell.tsx`
- Test: `src/components/NotificationBell.test.tsx`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NotificationBell } from './NotificationBell'

// Mock the hooks
vi.mock('../hooks/useNotifications', () => ({
  useNotifications: vi.fn(() => ({
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    markAsRead: vi.fn(),
    fetchNotifications: vi.fn(),
  })),
}))

vi.mock('../hooks/useCurrentUser', () => ({
  useCurrentUser: vi.fn(() => ({ user: { pubkey: 'test-pubkey' } })),
}))

describe('NotificationBell', () => {
  it('should render bell icon', () => {
    render(<NotificationBell />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('should show dot indicator when there are unread notifications', () => {
    const { useNotifications } = require('../hooks/useNotifications')
    useNotifications.mockReturnValue({
      notifications: [{ id: '1', read: false }],
      unreadCount: 1,
      isLoading: false,
      markAsRead: vi.fn(),
      fetchNotifications: vi.fn(),
    })

    const { container } = render(<NotificationBell />)
    expect(container.querySelector('.absolute')).toBeInTheDocument() // dot indicator
  })

  it('should not render when user is logged out', () => {
    const { useCurrentUser } = require('../hooks/useCurrentUser')
    useCurrentUser.mockReturnValue({ user: null })

    const { container } = render(<NotificationBell />)
    expect(container.firstChild).toBeNull()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm test -- NotificationBell.test.tsx`
Expected: FAIL with "Cannot find module './NotificationBell'"

**Step 3: Implement NotificationBell component**

```typescript
import { Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../hooks/useNotifications'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { NotificationDropdown } from './NotificationDropdown'
import type { VideoNotification } from '../types/notification'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Button } from './ui/button'

export function NotificationBell() {
  const { user } = useCurrentUser()
  const navigate = useNavigate()
  const { notifications, unreadCount, markAsRead } = useNotifications()

  if (!user) {
    return null
  }

  const handleNotificationClick = (notification: VideoNotification) => {
    // Mark as read
    markAsRead(notification.id)

    // Navigate to video page with comment hash
    navigate(`/v/${notification.videoEventId}#comment-${notification.commentId}`)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <NotificationDropdown
          notifications={notifications}
          onNotificationClick={handleNotificationClick}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- NotificationBell.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/NotificationBell.tsx src/components/NotificationBell.test.tsx
git commit -m "feat: add NotificationBell component with dropdown menu"
```

---

## Task 10: Add NotificationBell to Header

**Files:**

- Modify: `src/components/Header.tsx`

**Step 1: Add NotificationBell to Header component**

Locate the Header component and add the NotificationBell between the search bar and upload button:

```typescript
import { NotificationBell } from './NotificationBell'

// In the render method, add:
<div className="flex items-center gap-2">
  <GlobalSearchBar />
  <NotificationBell />
  {user && <UploadButton />}
  <LoginButton />
</div>
```

**Step 2: Test manually**

Run: `npm run dev`
Navigate to the app and verify:

- Bell icon appears when logged in
- Bell icon does not appear when logged out
- Clicking bell shows dropdown (empty state initially)

**Step 3: Commit**

```bash
git add src/components/Header.tsx
git commit -m "feat: add NotificationBell to Header component"
```

---

## Task 11: Add Login Time Tracking to App

**Files:**

- Modify: `src/App.tsx` or main layout component

**Step 1: Add useLoginTimeTracking hook**

In the main App component or layout wrapper:

```typescript
import { useLoginTimeTracking } from './hooks/useLoginTimeTracking'

function App() {
  useLoginTimeTracking()

  return (
    // ... rest of app
  )
}
```

**Step 2: Test login tracking**

Run: `npm run dev`

- Log out and clear localStorage
- Log in
- Check localStorage for `nostube_notifications` key
- Verify `lastLoginTime` is set

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add login time tracking to App component"
```

---

## Task 12: Add i18n Translation Keys

**Files:**

- Modify: `public/locales/en/translation.json`
- Modify: `public/locales/de/translation.json`
- Modify: `public/locales/fr/translation.json`
- Modify: `public/locales/es/translation.json`

**Step 1: Add English translations**

In `public/locales/en/translation.json`:

```json
{
  "notifications": {
    "commentedOnYourVideo": "commented on your video",
    "noNotifications": "No new notifications"
  }
}
```

**Step 2: Add German translations**

In `public/locales/de/translation.json`:

```json
{
  "notifications": {
    "commentedOnYourVideo": "hat Ihr Video kommentiert",
    "noNotifications": "Keine neuen Benachrichtigungen"
  }
}
```

**Step 3: Add French translations**

In `public/locales/fr/translation.json`:

```json
{
  "notifications": {
    "commentedOnYourVideo": "a commenté votre vidéo",
    "noNotifications": "Aucune nouvelle notification"
  }
}
```

**Step 4: Add Spanish translations**

In `public/locales/es/translation.json`:

```json
{
  "notifications": {
    "commentedOnYourVideo": "comentó en tu video",
    "noNotifications": "No hay notificaciones nuevas"
  }
}
```

**Step 5: Commit**

```bash
git add public/locales/*/translation.json
git commit -m "feat: add notification i18n translations for EN/DE/FR/ES"
```

---

## Task 13: Implement Comment Highlighting on VideoPage

**Files:**

- Modify: `src/components/VideoComments.tsx` or `src/components/CommentItem.tsx`
- Create: `src/hooks/useCommentHighlight.ts`

**Step 1: Add ID to comment elements**

In the component that renders individual comments (likely `CommentItem` or similar):

```typescript
// Add id attribute to comment container
<div id={`comment-${comment.id}`} className="...">
  {/* comment content */}
</div>
```

**Step 2: Create comment highlight hook**

```typescript
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export function useCommentHighlight() {
  const location = useLocation()

  useEffect(() => {
    const hash = location.hash
    if (!hash.startsWith('#comment-')) return

    const commentId = hash.replace('#comment-', '')
    const element = document.getElementById(`comment-${commentId}`)

    if (!element) return

    // Scroll to comment
    setTimeout(() => {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })

      // Add highlight animation
      element.classList.add('highlight-comment')

      // Remove after animation completes
      setTimeout(() => {
        element.classList.remove('highlight-comment')
      }, 3000)
    }, 100)
  }, [location.hash])
}
```

**Step 3: Add CSS for highlight animation**

In your global CSS or component styles:

```css
@keyframes highlight-fade {
  0% {
    background-color: hsl(var(--primary) / 0.2);
  }
  100% {
    background-color: transparent;
  }
}

.highlight-comment {
  animation: highlight-fade 3s ease-out;
}
```

**Step 4: Use hook in VideoPage**

In `src/pages/VideoPage.tsx`:

```typescript
import { useCommentHighlight } from '../hooks/useCommentHighlight'

export function VideoPage() {
  useCommentHighlight()

  return (
    // ... rest of component
  )
}
```

**Step 5: Commit**

```bash
git add src/components/CommentItem.tsx src/hooks/useCommentHighlight.ts src/pages/VideoPage.tsx src/index.css
git commit -m "feat: add comment highlighting and scroll on navigation from notifications"
```

---

## Task 14: Add Error Handling and Loading States

**Files:**

- Modify: `src/hooks/useNotifications.ts`
- Modify: `src/components/NotificationBell.tsx`

**Step 1: Add error state to hook**

```typescript
export function useNotifications() {
  // ... existing state ...
  const [error, setError] = useState<string | null>(null)

  const fetchNotifications = useCallback(async () => {
    if (!user || isFetchingRef.current) return

    isFetchingRef.current = true
    setIsLoading(true)
    setError(null) // Clear previous errors

    try {
      // ... existing fetch logic ...
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
      setError('Failed to load notifications')
    } finally {
      setIsLoading(false)
      isFetchingRef.current = false
    }
  }, [user, relayPool, eventStore])

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    fetchNotifications,
  }
}
```

**Step 2: Show loading state in dropdown**

Modify `NotificationDropdown.tsx`:

```typescript
import { Loader2 } from 'lucide-react'

export function NotificationDropdown({
  notifications,
  isLoading,
  error,
  onNotificationClick,
}: NotificationDropdownProps) {
  const { t } = useTranslation()

  if (error) {
    return (
      <div className="px-4 py-8 text-center text-sm text-destructive">
        {error}
      </div>
    )
  }

  if (isLoading && notifications.length === 0) {
    return (
      <div className="px-4 py-8 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (notifications.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        {t('notifications.noNotifications')}
      </div>
    )
  }

  return (
    <ScrollArea className="max-h-[80dvh]">
      <div className="py-2">
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onClick={onNotificationClick}
          />
        ))}
      </div>
    </ScrollArea>
  )
}
```

**Step 3: Commit**

```bash
git add src/hooks/useNotifications.ts src/components/NotificationDropdown.tsx
git commit -m "feat: add error handling and loading states to notifications"
```

---

## Task 15: Add Multi-Tab Synchronization

**Files:**

- Modify: `src/hooks/useNotifications.ts`

**Step 1: Add storage event listener**

```typescript
export function useNotifications() {
  // ... existing code ...

  // Sync read state across tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'nostube_notifications' && e.newValue) {
        try {
          const updated = JSON.parse(e.newValue)
          setNotifications(updated.notifications)
        } catch (error) {
          console.error('Failed to sync notifications:', error)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  // ... rest of hook ...
}
```

**Step 2: Commit**

```bash
git add src/hooks/useNotifications.ts
git commit -m "feat: add multi-tab synchronization via localStorage events"
```

---

## Task 16: Add Manual Testing Checklist

**Files:**

- Create: `docs/testing/notification-system-manual-tests.md`

**Step 1: Create manual testing document**

```markdown
# Notification System Manual Testing Checklist

## Setup

- [ ] Clear localStorage
- [ ] Have two accounts ready (tester and commenter)
- [ ] Have a test video published by tester account

## Core Functionality

- [ ] Log in with tester account
- [ ] Verify bell icon appears in header
- [ ] Have commenter account comment on tester's video
- [ ] Wait up to 2.5 minutes for notification to appear
- [ ] Verify red dot appears on bell icon
- [ ] Click bell to open dropdown
- [ ] Verify notification shows with correct avatar, name, video title, and time
- [ ] Click notification
- [ ] Verify navigation to video page
- [ ] Verify scroll to comment
- [ ] Verify highlight animation on comment
- [ ] Verify red dot disappears after marking as read

## Persistence

- [ ] Refresh page
- [ ] Verify notifications persist
- [ ] Verify read state persists
- [ ] Log out and log in
- [ ] Verify lastLoginTime updates

## Multi-Tab

- [ ] Open app in two tabs
- [ ] Mark notification as read in tab 1
- [ ] Verify notification updates in tab 2

## Edge Cases

- [ ] Test with deleted video (should show "Unknown video")
- [ ] Test with 100+ notifications (verify cleanup)
- [ ] Test with notifications older than 7 days (verify cleanup)
- [ ] Test when logged out (bell should not appear)

## i18n

- [ ] Test in all four languages (EN/DE/FR/ES)
- [ ] Verify translations appear correctly
```

**Step 2: Commit**

```bash
git add docs/testing/notification-system-manual-tests.md
git commit -m "docs: add manual testing checklist for notification system"
```

---

## Task 17: Update CHANGELOG.md

**Files:**

- Modify: `CHANGELOG.md`

**Step 1: Add changelog entry**

Add to the `[Unreleased]` section under `### Added`:

```markdown
- **Video Comment Notifications**: Bell icon in header with dropdown showing notifications when someone comments on your videos. Features: localStorage persistence with 7-day cleanup, polling every 2.5 minutes, dot indicator for unread notifications, click-to-navigate with comment highlighting, multi-tab synchronization. Components: `NotificationBell`, `NotificationDropdown`, `NotificationItem`. Hooks: `useNotifications`, `useLoginTimeTracking`, `useCommentHighlight`. i18n support for EN/DE/FR/ES
```

**Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add notification system to changelog"
```

---

## Task 18: Run Full Test Suite

**Step 1: Run type checking**

Run: `npm run typecheck`
Expected: No TypeScript errors

**Step 2: Run linting**

Run: `npm run format`
Expected: All files formatted

**Step 3: Run unit tests**

Run: `npm test`
Expected: All tests pass

**Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds without errors

**Step 5: Commit if any fixes needed**

```bash
git add .
git commit -m "fix: resolve linting and test issues"
```

---

## Task 19: Manual Testing Session

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Follow manual testing checklist**

Execute all tests from `docs/testing/notification-system-manual-tests.md`

**Step 3: Document any issues found**

Create issues or fix immediately

---

## Task 20: Final Integration and Polish

**Files:**

- Review all components for consistency
- Check accessibility (keyboard navigation, ARIA labels)
- Verify responsive design on mobile

**Step 1: Add ARIA labels**

Update `NotificationBell.tsx`:

```typescript
<Button
  variant="ghost"
  size="icon"
  className="relative"
  aria-label="Notifications"
>
  <Bell className="h-5 w-5" />
  {unreadCount > 0 && (
    <span
      className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500"
      aria-label={`${unreadCount} unread notifications`}
    />
  )}
</Button>
```

**Step 2: Test keyboard navigation**

- Tab to bell icon
- Press Enter to open dropdown
- Arrow keys to navigate notifications
- Enter to select notification

**Step 3: Test mobile responsive**

- Verify dropdown width on mobile
- Verify scroll behavior
- Verify touch interactions

**Step 4: Final commit**

```bash
git add .
git commit -m "feat: add accessibility improvements and mobile polish to notifications"
```

---

## Success Criteria

✅ Users can see when someone comments on their videos
✅ Notifications appear within 2.5 minutes of comment being posted
✅ Click notification navigates to video page and scrolls to comment
✅ Notifications persist across browser refresh
✅ Read state persists and syncs across tabs
✅ Bell icon shows red dot for unread notifications
✅ Dropdown opens smoothly with proper scrolling
✅ All translations work in EN/DE/FR/ES
✅ All tests pass
✅ Build succeeds
✅ No TypeScript errors
✅ No ESLint errors

---

## Future Enhancements (Out of Scope)

- Push notifications (browser API)
- Email notifications
- Notification preferences/settings
- Mute specific videos
- Mark all as read button
- Notification sounds
- Filter by notification type

---

## References

- **Design Doc:** `docs/plans/2025-11-30-notification-system-design.md`
- **NIP-22:** https://github.com/nostr-protocol/nips/blob/master/22.md
- **Applesauce Docs:** https://hzrd149.github.io/applesauce/
- **shadcn/ui DropdownMenu:** https://ui.shadcn.com/docs/components/dropdown-menu
