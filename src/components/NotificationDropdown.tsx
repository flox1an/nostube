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
        {notifications.map(notification => (
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
