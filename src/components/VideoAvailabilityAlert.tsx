import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/hooks'
import { dismissAlert, isAlertDismissed } from '@/lib/dismissed-alerts'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

interface VideoAvailabilityAlertProps {
  videoId: string
  blossomServerCount: number
  onMirror: () => void
}

/**
 * Alert shown when a video has limited availability (fewer than 2 servers)
 * Suggests mirroring for better redundancy
 * Only displayed when user is logged in and video has at least one Blossom URL
 */
export function VideoAvailabilityAlert({
  videoId,
  blossomServerCount,
  onMirror,
}: VideoAvailabilityAlertProps) {
  const { t } = useTranslation()
  const currentUser = useCurrentUser()
  const [isDismissed, setIsDismissed] = useState(false)

  // Check dismissed state on mount and when videoId changes
  useEffect(() => {
    setIsDismissed(isAlertDismissed(videoId, 'availability'))
  }, [videoId])

  const handleDismiss = () => {
    dismissAlert(videoId, 'availability')
    setIsDismissed(true)
  }

  // Only show if logged in, has at least one Blossom URL, fewer than 2 servers, and not dismissed
  if (!currentUser.user || blossomServerCount === 0 || blossomServerCount > 1 || isDismissed)
    return null

  return (
    <Alert className="border-primary relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6"
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" />
      </Button>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{t('video.availability.alertTitle')}</AlertTitle>
      <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-muted-foreground">
        <span className="flex-1">
          {t('video.availability.alertDescription', { count: blossomServerCount })}
        </span>
        <Button
          onClick={onMirror}
          disabled={false}
          size="sm"
          className="sm:ml-4 shrink-0 sm:self-center"
        >
          {t('video.availability.mirrorButton')}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
