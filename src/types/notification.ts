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

export type UploadNotificationType =
  | 'upload_complete'
  | 'transcode_complete'
  | 'upload_error'
  | 'transcode_error'

export interface UploadNotification {
  id: string
  type: UploadNotificationType
  draftId: string
  videoTitle?: string
  timestamp: number // unix timestamp in seconds
  read: boolean
  resolution?: string // for transcode notifications
  errorMessage?: string // for error notifications
}

export interface ZapNotification {
  id: string // zap receipt event ID
  zapperPubkey: string // who sent the zap
  amount: number // sats
  comment?: string // optional zap comment
  videoId: string // zapped video event ID
  videoTitle?: string // cached video title
  timestamp: number // unix timestamp in seconds
  read: boolean
  videoEventId: string // for navigation (nevent or naddr)
}

export type Notification = VideoNotification | UploadNotification | ZapNotification

export interface NotificationStorage {
  lastLoginTime: number
  notifications: VideoNotification[]
  lastFetchTime: number
}

export interface UploadNotificationStorage {
  notifications: UploadNotification[]
  lastUpdated: number
}

export interface ZapNotificationStorage {
  notifications: ZapNotification[]
  lastFetchTime: number
}

// Type guards
export function isVideoNotification(n: Notification): n is VideoNotification {
  return 'commentId' in n
}

export function isUploadNotification(n: Notification): n is UploadNotification {
  return (
    'type' in n &&
    ['upload_complete', 'transcode_complete', 'upload_error', 'transcode_error'].includes(
      (n as UploadNotification).type
    )
  )
}

export function isZapNotification(n: Notification): n is ZapNotification {
  return 'zapperPubkey' in n && 'amount' in n
}
