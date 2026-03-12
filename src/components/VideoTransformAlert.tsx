import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/hooks'
import { useTranslation } from 'react-i18next'
import { type VideoVariant } from '@/utils/video-event'
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
  onTransform: () => void
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
  onTransform,
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
      return t('video.transform.alertDescriptionBoth')
    } else if (needsLowerRes) {
      return t('video.transform.alertDescriptionLowRes')
    } else {
      return t('video.transform.alertDescriptionIOS')
    }
  }

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
      <AlertTitle>{t('video.transform.alertTitle')}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 text-muted-foreground">
        <span>{getAlertDescription()}</span>
        <Button onClick={onTransform} size="sm" className="w-fit">
          {t('video.transform.contributeButton')}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
