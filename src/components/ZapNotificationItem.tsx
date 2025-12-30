import { formatDistance } from 'date-fns'
import { Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ZapNotification } from '../types/notification'
import { UserAvatar } from './UserAvatar'
import { getDateLocale } from '../lib/date-locale'
import { useProfile } from '../hooks/useProfile'
import { formatSats } from '../lib/zap-utils'

interface ZapNotificationItemProps {
  notification: ZapNotification
  onClick: (notification: ZapNotification) => void
}

export function ZapNotificationItem({ notification, onClick }: ZapNotificationItemProps) {
  const { t, i18n } = useTranslation()
  const profile = useProfile({ pubkey: notification.zapperPubkey })

  const displayName = profile?.displayName || profile?.name || notification.zapperPubkey.slice(0, 8)

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
          pubkey={notification.zapperPubkey}
          name={displayName}
          className="h-8 w-8 shrink-0"
        />

        <div className="flex-1 min-w-0">
          <p className="text-sm">
            <span className="font-medium">{displayName}</span>{' '}
            {t('notifications.zappedYourVideo', { amount: formatSats(notification.amount) })}
            <Zap className="inline-block h-3.5 w-3.5 ml-1 text-yellow-500 fill-yellow-500" />
          </p>

          {notification.videoTitle && (
            <p className="text-sm text-muted-foreground truncate mt-0.5">
              {notification.videoTitle}
            </p>
          )}

          {notification.comment && (
            <p className="text-sm text-muted-foreground truncate mt-0.5 italic">
              "{notification.comment}"
            </p>
          )}

          <p className="text-xs text-muted-foreground mt-1">{relativeTime}</p>
        </div>
      </div>
    </button>
  )
}
