import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import type { VideoNotification } from '../types/notification'
import { NotificationItem } from './NotificationItem'
import { ScrollArea } from './ui/scroll-area'

interface NotificationDropdownProps {
  notifications: VideoNotification[]
  isLoading?: boolean
  error?: string | null
  onNotificationClick: (notification: VideoNotification) => void
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
