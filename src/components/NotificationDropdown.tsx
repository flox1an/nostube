import { useTranslation } from 'react-i18next'
import { Loader2, CheckCheck } from 'lucide-react'
import type { Notification } from '../types/notification'
import { isVideoNotification, isUploadNotification } from '../types/notification'
import { NotificationItem } from './NotificationItem'
import { UploadNotificationItem } from './UploadNotificationItem'
import { ScrollArea } from './ui/scroll-area'
import { Button } from './ui/button'

interface NotificationDropdownProps {
  notifications: Notification[]
  isLoading?: boolean
  error?: string | null
  unreadCount?: number
  onNotificationClick: (notification: Notification) => void
  onMarkAllAsRead?: () => void
}

export function NotificationDropdown({
  notifications,
  isLoading = false,
  error = null,
  unreadCount = 0,
  onNotificationClick,
  onMarkAllAsRead,
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
    <div className="flex flex-col">
      {unreadCount > 0 && onMarkAllAsRead && (
        <div className="flex justify-end px-2 pt-2 pb-1 border-b">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
            onClick={onMarkAllAsRead}
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" />
            {t('notifications.markAllAsRead')}
          </Button>
        </div>
      )}
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
    </div>
  )
}
