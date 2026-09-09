import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/hooks'
import { dismissAlert, isAlertDismissed } from '@/lib/dismissed-alerts'
import { useTrustScore } from '@/hooks/useTrustScore'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

/** Minimum global NosTube score (0–1) for the author to show the mirror alert */
const MIN_GLOBAL_SCORE = 0.1

interface VideoAvailabilityAlertProps {
  videoId: string
  authorPubkey?: string
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
  authorPubkey,
  blossomServerCount,
  onMirror,
}: VideoAvailabilityAlertProps) {
  const { t } = useTranslation()
  const currentUser = useCurrentUser()
  const { globalScore } = useTrustScore(authorPubkey)
  const [isDismissed, setIsDismissed] = useState(false)

  // Check dismissed state on mount and when videoId changes
  useEffect(() => {
    setIsDismissed(isAlertDismissed(videoId, 'availability'))
  }, [videoId])

  const handleDismiss = () => {
    dismissAlert(videoId, 'availability')
    setIsDismissed(true)
  }

  // Only show if logged in, has at least one Blossom URL, fewer than 2 servers, not dismissed,
  // and author has sufficient global score
  if (!currentUser.user || blossomServerCount === 0 || blossomServerCount > 1 || isDismissed)
    return null
  if (globalScore === null || globalScore < MIN_GLOBAL_SCORE) return null

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <span className="flex-1">
        {t('video.availability.alertDescription', { count: blossomServerCount })}
      </span>
      <Button onClick={onMirror} size="sm" variant="outline" className="h-7 shrink-0 text-xs">
        {t('video.availability.mirrorButton')}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        aria-label="Dismiss availability alert"
        onClick={handleDismiss}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
