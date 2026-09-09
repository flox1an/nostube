import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/hooks'
import { useTranslation } from 'react-i18next'
import { type VideoVariant } from '@/utils/video-event'
import { isBlossomUrl } from '@/lib/blossom-url'
import {
  needsLowerResolutionVariants,
  needsIOSCompatibleVariants,
  extractCodecFromMimeType,
} from '@/lib/video-transformation-detection'
import { dismissAlert, isAlertDismissed } from '@/lib/dismissed-alerts'
import { useTrustScore } from '@/hooks/useTrustScore'
import { useState, useEffect } from 'react'

/** Minimum global NosTube score (0–1) for the author to show the transform alert */
const MIN_GLOBAL_SCORE = 0.2

interface VideoTransformAlertProps {
  videoId: string
  authorPubkey?: string
  videoVariants: VideoVariant[]
  onContribute: () => void
}

/**
 * Alert shown when a video needs transformation for better compatibility
 * Suggests contributing transformed versions (lower resolution or iOS-compatible codecs)
 * Only displayed when user is logged in and video needs transformation
 */
export function VideoTransformAlert({
  videoId,
  authorPubkey,
  videoVariants,
  onContribute,
}: VideoTransformAlertProps) {
  const { t } = useTranslation()
  const currentUser = useCurrentUser()
  const { globalScore } = useTrustScore(authorPubkey)
  const [isDismissed, setIsDismissed] = useState(false)

  // Check dismissed state on mount and when videoId changes
  useEffect(() => {
    setIsDismissed(isAlertDismissed(videoId, 'transformation'))
  }, [videoId])

  const handleDismiss = () => {
    dismissAlert(videoId, 'transformation')
    setIsDismissed(true)
  }

  // Only show if logged in and author has sufficient global score
  if (!currentUser.user) return null
  if (globalScore === null || globalScore < MIN_GLOBAL_SCORE) return null

  // Check if video variants exist
  if (!videoVariants || videoVariants.length === 0) return null

  // Contributing a variant needs a downloadable blossom blob as source —
  // skip YouTube embeds and other non-blossom URLs
  if (!videoVariants.some(v => isBlossomUrl(v.url))) return null

  // Check if transformation is needed
  const needsLowerRes = needsLowerResolutionVariants(videoVariants)
  const needsIOSCompatible = needsIOSCompatibleVariants(videoVariants)

  // Don't show if no transformation needed or dismissed
  if (!needsLowerRes && !needsIOSCompatible) return null

  // Skip alert for small H.264 files — widely compatible, low bandwidth anyway
  const MAX_SMALL_FILE_SIZE = 50 * 1024 * 1024 // 50 MB
  const isSmallFile = videoVariants.every(v => v.size !== undefined && v.size < MAX_SMALL_FILE_SIZE)
  const isAllH264 = videoVariants.every(v => {
    const codec = extractCodecFromMimeType(v.mimeType)
    return !codec || codec === 'avc1' || codec === 'avc'
  })
  if (isSmallFile && isAllH264) return null
  if (isDismissed) return null

  // Determine which message to show based on needs
  const getAlertDescription = () => {
    if (needsLowerRes && needsIOSCompatible) {
      return t('video.contribute.alertDescriptionBoth')
    } else if (needsLowerRes) {
      return t('video.contribute.alertDescriptionLowRes')
    } else {
      return t('video.contribute.alertDescriptionIOS')
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <span className="flex-1">{getAlertDescription()}</span>
      <Button onClick={onContribute} size="sm" variant="outline" className="h-7 shrink-0 text-xs">
        {t('video.contribute.contributeButton')}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        aria-label="Dismiss contribution alert"
        onClick={handleDismiss}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
