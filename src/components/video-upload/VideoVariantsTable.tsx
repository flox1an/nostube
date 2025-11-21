import { VideoVariant } from '@/lib/video-processing'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Trash2, Play } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useState } from 'react'

interface VideoVariantsTableProps {
  videos: VideoVariant[]
  onRemove?: (index: number) => void
  onPreview?: (video: VideoVariant) => void
}

export function VideoVariantsTable({ videos, onRemove, onPreview }: VideoVariantsTableProps) {
  const { t } = useTranslation()
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

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
              <TableHead className="w-24 text-right">{t('upload.videoTable.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {videos.map((video, index) => (
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
                  {video.videoCodec || '-'}
                </TableCell>
                <TableCell
                  className="font-mono text-xs max-w-[120px] truncate"
                  title={video.audioCodec}
                >
                  {video.audioCodec || '-'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
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
            ))}
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
