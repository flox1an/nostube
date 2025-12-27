import { Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAllNotifications } from '../hooks/useAllNotifications'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { NotificationDropdown } from './NotificationDropdown'
import type { Notification } from '../types/notification'
import { isVideoNotification, isUploadNotification } from '../types/notification'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Button } from './ui/button'

export function NotificationBell() {
  const { user } = useCurrentUser()
  const navigate = useNavigate()
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    markVideoNotificationAsRead,
    markUploadNotificationAsRead,
    markAllAsRead,
  } = useAllNotifications()

  if (!user) {
    return null
  }

  const handleNotificationClick = (notification: Notification) => {
    if (isVideoNotification(notification)) {
      // Mark as read
      markVideoNotificationAsRead(notification.id)

      // Navigate to video page with comment query parameter
      navigate(`/video/${notification.videoEventId}?comment=${notification.commentId}`)
    } else if (isUploadNotification(notification)) {
      // Mark as read
      markUploadNotificationAsRead(notification.id)

      // Navigate to upload page with the draft
      navigate(`/upload?draft=${notification.draftId}`)
    }
  }

  // Only disable if there are no notifications AND not loading
  // Keep enabled if there are notifications (read or unread)
  const isDisabled = notifications.length === 0 && !isLoading

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifications"
          disabled={isDisabled}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500"
              aria-label={`${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`}
            />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <NotificationDropdown
          notifications={notifications}
          isLoading={isLoading}
          error={error}
          unreadCount={unreadCount}
          onNotificationClick={handleNotificationClick}
          onMarkAllAsRead={markAllAsRead}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
