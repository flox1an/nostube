import { formatDistance } from 'date-fns'
import { useTranslation } from 'react-i18next'
import type { VideoNotification } from '../types/notification'
import { UserAvatar } from './UserAvatar'
import { getDateLocale } from '../lib/date-locale'
import { useProfile } from '../hooks/useProfile'

interface NotificationItemProps {
  notification: VideoNotification
  onClick: (notification: VideoNotification) => void
}

export function NotificationItem({ notification, onClick }: NotificationItemProps) {
  const { t, i18n } = useTranslation()
  const profile = useProfile({ pubkey: notification.commenterPubkey })

  const displayName =
    profile?.displayName || profile?.name || notification.commenterPubkey.slice(0, 8)

  const relativeTime = formatDistance(new Date(notification.timestamp * 1000), new Date(), {
    addSuffix: true,
    locale: getDateLocale(i18n.language),
  })

  return (
    <button
      onClick={() => onClick(notification)}
      className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
        notification.read ? 'opacity-60' : ''
      }`}
    >
      <div className="flex gap-3">
        <UserAvatar
          picture={profile?.picture}
          pubkey={notification.commenterPubkey}
          name={displayName}
          className="h-8 w-8 shrink-0"
        />

        <div className="flex-1 min-w-0">
          <p className="text-sm">
            <span className="font-medium">{displayName}</span>{' '}
            {notification.isReplyToComment
              ? t('notifications.repliedToYourComment')
              : t('notifications.commentedOnYourVideo')}
          </p>

          {notification.videoTitle && (
            <p className="text-sm text-muted-foreground truncate mt-0.5">
              {notification.videoTitle}
            </p>
          )}

          <p className="text-xs text-muted-foreground mt-1">{relativeTime}</p>
        </div>
      </div>
    </button>
  )
}
