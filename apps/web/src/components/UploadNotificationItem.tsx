import { formatDistance } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, AlertCircle, Upload, Video } from 'lucide-react'
import type { UploadNotification } from '../types/notification'
import { getDateLocale } from '../lib/date-locale'

interface UploadNotificationItemProps {
  notification: UploadNotification
  onClick: (notification: UploadNotification) => void
}

export function UploadNotificationItem({ notification, onClick }: UploadNotificationItemProps) {
  const { t, i18n } = useTranslation()

  const relativeTime = formatDistance(new Date(notification.timestamp * 1000), new Date(), {
    addSuffix: true,
    locale: getDateLocale(i18n.language),
  })

  // Get icon and colors based on notification type
  const getIconAndStyle = () => {
    switch (notification.type) {
      case 'upload_complete':
        return {
          icon: <Upload className="h-4 w-4" />,
          bgColor: 'bg-green-500/10',
          iconColor: 'text-green-500',
        }
      case 'transcode_complete':
        return {
          icon: <CheckCircle2 className="h-4 w-4" />,
          bgColor: 'bg-green-500/10',
          iconColor: 'text-green-500',
        }
      case 'upload_error':
        return {
          icon: <AlertCircle className="h-4 w-4" />,
          bgColor: 'bg-red-500/10',
          iconColor: 'text-red-500',
        }
      case 'transcode_error':
        return {
          icon: <AlertCircle className="h-4 w-4" />,
          bgColor: 'bg-red-500/10',
          iconColor: 'text-red-500',
        }
      default:
        return {
          icon: <Video className="h-4 w-4" />,
          bgColor: 'bg-muted',
          iconColor: 'text-muted-foreground',
        }
    }
  }

  // Get message based on notification type
  const getMessage = () => {
    switch (notification.type) {
      case 'upload_complete':
        return t('notifications.uploadComplete', 'Upload complete')
      case 'transcode_complete':
        return notification.resolution
          ? t('notifications.transcodeCompleteResolution', {
              defaultValue: '{{resolution}} transcode complete',
              resolution: notification.resolution,
            })
          : t('notifications.transcodeComplete', 'Transcode complete')
      case 'upload_error':
        return t('notifications.uploadError', 'Upload failed')
      case 'transcode_error':
        return t('notifications.transcodeError', 'Transcode failed')
      default:
        return ''
    }
  }

  const { icon, bgColor, iconColor } = getIconAndStyle()

  return (
    <button
      onClick={() => onClick(notification)}
      className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
        notification.read ? 'opacity-60' : ''
      }`}
    >
      <div className="flex gap-3">
        <div
          className={`h-8 w-8 shrink-0 rounded-full ${bgColor} flex items-center justify-center ${iconColor}`}
        >
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{getMessage()}</p>

          {notification.videoTitle && (
            <p className="text-sm text-muted-foreground truncate mt-0.5">
              {notification.videoTitle}
            </p>
          )}

          {notification.errorMessage && (
            <p className="text-xs text-red-500 mt-0.5 line-clamp-2">{notification.errorMessage}</p>
          )}

          <p className="text-xs text-muted-foreground mt-1">{relativeTime}</p>
        </div>
      </div>
    </button>
  )
}
