export interface VideoNotification {
  id: string                    // comment event ID
  commentId: string             // same as id, for clarity
  videoId: string               // the video that was commented on (event ID)
  videoTitle?: string           // cached video title
  commenterPubkey: string       // who commented
  commentContent: string        // what they said (first 100 chars)
  timestamp: number             // when (created_at)
  read: boolean                 // read status
  videoEventId: string          // for navigation (nevent or naddr)
}

export interface NotificationStorage {
  lastLoginTime: number
  notifications: VideoNotification[]
  lastFetchTime: number
}
