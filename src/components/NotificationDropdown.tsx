import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import type { Notification } from '../types/notification'
import { isVideoNotification, isUploadNotification } from '../types/notification'
import { NotificationItem } from './NotificationItem'
import { UploadNotificationItem } from './UploadNotificationItem'
import { ScrollArea } from './ui/scroll-area'

interface NotificationDropdownProps {
  notifications: Notification[]
  isLoading?: boolean
  error?: string | null
  onNotificationClick: (notification: Notification) => void
}

export function NotificationDropdown({
  notifications,
  isLoading = false,
  error = null,
  onNotificationClick,
}: NotificationDropdownProps) {
  const { t } = useTranslation()

  if (error) {
    return <div className="px-4 py-8 text-center text-sm text-destructive">{error}</div>
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
    <ScrollArea className="h-[400px] max-h-[80dvh]">
      <div className="py-2">
        {notifications.map(notification => {
          if (isVideoNotification(notification)) {
            return (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClick={() => onNotificationClick(notification)}
              />
            )
          }
          if (isUploadNotification(notification)) {
            return (
              <UploadNotificationItem
                key={notification.id}
                notification={notification}
                onClick={() => onNotificationClick(notification)}
              />
            )
          }
          return null
        })}
      </div>
    </ScrollArea>
  )
}
