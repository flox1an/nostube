import { Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../hooks/useNotifications'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { NotificationDropdown } from './NotificationDropdown'
import type { VideoNotification } from '../types/notification'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Button } from './ui/button'

export function NotificationBell() {
  const { user } = useCurrentUser()
  const navigate = useNavigate()
  const { notifications, unreadCount, isLoading, error, markAsRead } = useNotifications()

  if (!user) {
    return null
  }

  const handleNotificationClick = (notification: VideoNotification) => {
    // Mark as read
    markAsRead(notification.id)

    // Navigate to video page with comment hash
    navigate(`/video/${notification.videoEventId}#comment-${notification.commentId}`)
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
          isLoading={isLoading}
          error={error}
          onNotificationClick={handleNotificationClick}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
