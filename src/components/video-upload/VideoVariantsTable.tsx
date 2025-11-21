import { VideoVariant } from '@/lib/video-processing'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Trash2, Play, AlertTriangle, CheckCircle, Info, Copy } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface VideoVariantsTableProps {
  videos: VideoVariant[]
  onRemove?: (index: number) => void
  onPreview?: (video: VideoVariant) => void
}

function getCodecWarning(
  videoCodec?: string
): { type: 'error' | 'warning' | 'info' | 'success'; key: string } | null {
  if (!videoCodec) return null

  const codecLower = videoCodec.toLowerCase()

  // AV1 - not supported on iOS/Safari
  if (codecLower.startsWith('av01')) {
    return { type: 'error', key: 'upload.metadata.warningAv1' }
  }

  // VP9 - not supported on iOS/Safari
  if (codecLower.startsWith('vp09') || codecLower.startsWith('vp9')) {
    return { type: 'error', key: 'upload.metadata.warningVp9' }
  }

  // H.265/HEVC with hev1 - not on iOS
  if (codecLower.startsWith('hev1')) {
    return { type: 'warning', key: 'upload.metadata.warningH265' }
  }

  // H.265/HEVC with hvc1 - widely supported
  if (codecLower.startsWith('hvc1')) {
    return { type: 'info', key: 'upload.metadata.infoH265hvc1' }
  }

  // H.264/AVC - best compatibility
  if (codecLower.startsWith('avc1')) {
    return { type: 'success', key: 'upload.metadata.successH264' }
  }

  return null
}

export function VideoVariantsTable({ videos, onRemove, onPreview }: VideoVariantsTableProps) {
  const { t } = useTranslation()
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  if (videos.length === 0) {
    return null
  }

  const handlePreviewClick = (index: number) => {
    if (previewIndex === index) {
      setPreviewIndex(null)
    } else {
      setPreviewIndex(index)
      if (onPreview) {
        onPreview(videos[index])
      }
    }
  }

  const handleToggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index)
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>{t('upload.videoTable.quality')}</TableHead>
              <TableHead>{t('upload.videoTable.dimensions')}</TableHead>
              <TableHead>{t('upload.videoTable.duration')}</TableHead>
              <TableHead>{t('upload.videoTable.size')}</TableHead>
              <TableHead>{t('upload.videoTable.videoCodec')}</TableHead>
              <TableHead>{t('upload.videoTable.audioCodec')}</TableHead>
              <TableHead className="w-28">{t('upload.videoTable.status')}</TableHead>
              <TableHead className="w-32 text-right">{t('upload.videoTable.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {videos.map((video, index) => {
              const codecWarning = getCodecWarning(video.videoCodec)
              const isExpanded = expandedIndex === index
              const hasDetails = codecWarning || video.uploadedBlobs.length > 0

              return (
                <>
                  <TableRow key={index} className={previewIndex === index ? 'bg-muted/50' : ''}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell>
                      <span className="inline-block px-2 py-1 text-xs font-semibold bg-primary/10 text-primary rounded">
                        {video.qualityLabel}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{video.dimension}</TableCell>
                    <TableCell className="font-mono text-sm">{video.duration}s</TableCell>
                    <TableCell className="font-mono text-sm">
                      {video.sizeMB ? `${video.sizeMB} MB` : '-'}
                    </TableCell>
                    <TableCell
                      className="font-mono text-xs max-w-[120px] truncate"
                      title={video.videoCodec}
                    >
                      <div className="flex items-center gap-1">
                        {video.videoCodec || '-'}
                        {codecWarning && (
                          <>
                            {codecWarning.type === 'error' && (
                              <AlertTriangle className="h-3 w-3 text-red-500" />
                            )}
                            {codecWarning.type === 'warning' && (
                              <AlertTriangle className="h-3 w-3 text-yellow-500" />
                            )}
                            {codecWarning.type === 'info' && (
                              <Info className="h-3 w-3 text-blue-500" />
                            )}
                            {codecWarning.type === 'success' && (
                              <CheckCircle className="h-3 w-3 text-green-500" />
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell
                      className="font-mono text-xs max-w-[120px] truncate"
                      title={video.audioCodec}
                    >
                      {video.audioCodec || '-'}
                    </TableCell>
                    <TableCell>
                      <TooltipProvider>
                        <div className="flex items-center gap-2">
                          {video.uploadedBlobs.length > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1 cursor-help">
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                  <span className="text-xs font-medium">
                                    {video.uploadedBlobs.length}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="space-y-1">
                                  <p className="font-semibold text-xs">
                                    {t('upload.videoTable.uploadedTo')}:
                                  </p>
                                  {video.uploadedBlobs.map((blob, idx) => {
                                    const url = new URL(blob.url)
                                    return (
                                      <p key={idx} className="text-xs">
                                        ✓ {url.hostname}
                                      </p>
                                    )
                                  })}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {video.mirroredBlobs.length > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1 cursor-help">
                                  <Copy className="h-4 w-4 text-blue-500" />
                                  <span className="text-xs font-medium">
                                    {video.mirroredBlobs.length}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="space-y-1">
                                  <p className="font-semibold text-xs">
                                    {t('upload.videoTable.mirroredTo')}:
                                  </p>
                                  {video.mirroredBlobs.map((blob, idx) => {
                                    const url = new URL(blob.url)
                                    return (
                                      <p key={idx} className="text-xs">
                                        ✓ {url.hostname}
                                      </p>
                                    )
                                  })}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {hasDetails && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleExpand(index)}
                            className="h-8 w-8 p-0"
                            title={
                              isExpanded
                                ? t('upload.videoTable.hideDetails')
                                : t('upload.videoTable.showDetails')
                            }
                          >
                            <Info className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePreviewClick(index)}
                          className="h-8 w-8 p-0"
                          title={t('upload.videoTable.preview')}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        {onRemove && videos.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onRemove(index)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            title={t('upload.videoTable.remove')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow key={`${index}-details`}>
                      <TableCell colSpan={8} className="bg-muted/30 p-4">
                        <div className="space-y-3">
                          {/* Codec Warning */}
                          {codecWarning && (
                            <Alert
                              variant={
                                codecWarning.type === 'error' || codecWarning.type === 'warning'
                                  ? 'destructive'
                                  : 'default'
                              }
                              className={
                                codecWarning.type === 'success'
                                  ? 'border-green-500 bg-green-50'
                                  : codecWarning.type === 'info'
                                    ? 'border-blue-500 bg-blue-50'
                                    : ''
                              }
                            >
                              <div className="flex items-start gap-2">
                                {codecWarning.type === 'error' && (
                                  <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5" />
                                )}
                                {codecWarning.type === 'warning' && (
                                  <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                                )}
                                {codecWarning.type === 'info' && (
                                  <Info className="h-4 w-4 text-blue-500 mt-0.5" />
                                )}
                                {codecWarning.type === 'success' && (
                                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                                )}
                                <AlertDescription className="text-sm">
                                  {t(codecWarning.key)}
                                </AlertDescription>
                              </div>
                            </Alert>
                          )}

                          {/* Upload Status */}
                          {video.uploadedBlobs.length > 0 && (
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold">
                                {t('upload.videoTable.uploadStatus')}
                              </h4>
                              <div className="grid gap-2">
                                <div className="text-sm">
                                  <span className="font-medium">
                                    {t('upload.videoTable.uploadedTo')}:
                                  </span>{' '}
                                  {video.uploadedBlobs.length} {t('upload.videoTable.servers')}
                                </div>
                                {video.mirroredBlobs.length > 0 && (
                                  <div className="text-sm">
                                    <span className="font-medium">
                                      {t('upload.videoTable.mirroredTo')}:
                                    </span>{' '}
                                    {video.mirroredBlobs.length} {t('upload.videoTable.servers')}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Video Preview */}
      {previewIndex !== null && videos[previewIndex] && (
        <div className="border rounded-lg p-4 bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">
              {t('upload.videoTable.previewTitle', {
                quality: videos[previewIndex].qualityLabel,
              })}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreviewIndex(null)}
              className="h-8 cursor-pointer"
            >
              {t('upload.videoTable.closePreview')}
            </Button>
          </div>
          <video
            controls
            className="w-full rounded border shadow max-h-96"
            crossOrigin="anonymous"
            key={previewIndex}
          >
            <source
              src={
                videos[previewIndex].inputMethod === 'url'
                  ? videos[previewIndex].url
                  : videos[previewIndex].uploadedBlobs[0]?.url
              }
            />
            {videos[previewIndex].inputMethod === 'file' &&
              videos[previewIndex].uploadedBlobs
                .slice(1)
                .map((blob, idx) => <source key={blob.url || idx} src={blob.url} />)}
            Your browser does not support the video tag.
          </video>
        </div>
      )}
    </div>
  )
}
