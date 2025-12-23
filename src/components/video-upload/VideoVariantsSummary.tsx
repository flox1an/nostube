import type { VideoVariant } from '@/lib/video-processing'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, CheckCircle, Copy, AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { VideoVariantsTable } from './VideoVariantsTable'

interface VideoVariantsSummaryProps {
  videos: VideoVariant[]
  onRemove?: (index: number) => void
  onPreview?: (video: VideoVariant) => void
}

function getCodecWarning(videoCodec?: string): 'error' | 'warning' | 'success' | null {
  if (!videoCodec) return null

  const codecLower = videoCodec.toLowerCase()

  // AV1 - not supported on iOS/Safari
  if (codecLower.startsWith('av01')) return 'error'

  // VP9 - not supported on iOS/Safari
  if (codecLower.startsWith('vp09') || codecLower.startsWith('vp9')) return 'error'

  // H.265/HEVC with hev1 - not on iOS
  if (codecLower.startsWith('hev1')) return 'warning'

  // H.264/AVC - best compatibility
  if (codecLower.startsWith('avc1')) return 'success'

  return null
}

export function VideoVariantsSummary({ videos, onRemove, onPreview }: VideoVariantsSummaryProps) {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)

  if (videos.length === 0) {
    return null
  }

  // Get primary video (first one)
  const primaryVideo = videos[0]
  const hasMultipleVariants = videos.length > 1

  // Calculate total size
  const totalSizeMB = videos.reduce((sum, v) => sum + (v.sizeMB || 0), 0)

  // Check for codec warnings
  const hasCodecWarning = videos.some(
    v => getCodecWarning(v.videoCodec) === 'error' || getCodecWarning(v.videoCodec) === 'warning'
  )

  // Count uploaded and mirrored
  const totalUploaded = videos.reduce((sum, v) => sum + v.uploadedBlobs.length, 0)
  const totalMirrored = videos.reduce((sum, v) => sum + v.mirroredBlobs.length, 0)

  return (
    <div className="space-y-2">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              {/* Quality badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {hasMultipleVariants ? (
                  <>
                    {videos.map((video, index) => (
                      <Badge key={index} variant="secondary" className="font-mono">
                        {video.qualityLabel}
                      </Badge>
                    ))}
                  </>
                ) : (
                  <Badge variant="secondary" className="font-mono text-base">
                    {primaryVideo.qualityLabel}
                  </Badge>
                )}
              </div>

              {/* Video info */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                <span className="font-mono">{primaryVideo.dimension}</span>
                <span>•</span>
                <span className="font-mono">{primaryVideo.duration}s</span>
                <span>•</span>
                <span className="font-mono">
                  {totalSizeMB >= 1000
                    ? `${(totalSizeMB / 1024).toFixed(2)} GB`
                    : `${totalSizeMB.toFixed(2)} MB`}
                </span>
                {hasMultipleVariants && (
                  <>
                    <span>•</span>
                    <span>
                      {videos.length} {t('upload.videoTable.qualities')}
                    </span>
                  </>
                )}
              </div>

              {/* Status indicators */}
              <div className="flex items-center gap-3">
                {totalUploaded > 0 && (
                  <div className="flex items-center gap-1 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-muted-foreground">
                      {totalUploaded} {t('upload.videoTable.uploaded')}
                    </span>
                  </div>
                )}
                {totalMirrored > 0 && (
                  <div className="flex items-center gap-1 text-sm">
                    <Copy className="h-4 w-4 text-blue-500" />
                    <span className="text-muted-foreground">
                      {totalMirrored} {t('upload.videoTable.mirrored')}
                    </span>
                  </div>
                )}
                {hasCodecWarning && (
                  <div className="flex items-center gap-1 text-sm">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <span className="text-muted-foreground">{t('upload.codecWarning')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Expand/Collapse button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="shrink-0"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  {t('common.hide')}
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  {t('upload.showDetails')}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Expanded details */}
      {isExpanded && (
        <VideoVariantsTable videos={videos} onRemove={onRemove} onPreview={onPreview} />
      )}
    </div>
  )
}
