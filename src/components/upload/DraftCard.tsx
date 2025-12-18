import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ImageOff, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { UploadDraft } from '@/types/upload-draft'
import { getSmartStatus, getVideoQualityInfo, getRelativeTime } from '@/lib/upload-draft-utils'

interface DraftCardProps {
  draft: UploadDraft
  onSelect: () => void
  onDelete: () => void
}

export function DraftCard({ draft, onSelect, onDelete }: DraftCardProps) {
  const { t } = useTranslation()
  const thumbnailUrl = draft.thumbnailUploadInfo.uploadedBlobs[0]?.url
  const smartStatus = getSmartStatus(draft)
  const qualityInfo = getVideoQualityInfo(draft)
  const relativeTime = getRelativeTime(draft.updatedAt)

  const timeText =
    typeof relativeTime === 'string' ? t(relativeTime) : t(relativeTime[0], relativeTime[1])

  return (
    <Card
      className="p-4 cursor-pointer hover:bg-muted/50 transition-colors group"
      onClick={onSelect}
    >
      <div className="flex gap-4">
        {/* Thumbnail */}
        <div className="flex-shrink-0">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={draft.title || t('upload.draft.untitled')}
              className="w-32 h-20 object-cover rounded"
            />
          ) : (
            <div className="w-32 h-20 bg-muted rounded flex items-center justify-center">
              <ImageOff className="w-8 h-8 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{draft.title || t('upload.draft.untitled')}</h3>
          <p className="text-sm text-muted-foreground mt-1">{qualityInfo || '—'}</p>
          <p className="text-sm text-muted-foreground mt-1">{t(smartStatus)}</p>
          <p className="text-xs text-muted-foreground mt-2">{timeText}</p>
        </div>

        {/* Delete button */}
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            onClick={e => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  )
}
