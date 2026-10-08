import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ReplaceVideoFlow } from './ReplaceVideoFlow'
import { type ParsedImeta } from '@/lib/imeta-builder'
import { Play, ArrowRightLeft, Plus, Trash2, Link as LinkIcon, HardDrive } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface VideoVariantsListProps {
  imetaTags: ParsedImeta[]
  onVariantReplaced: (index: number, newTag: string[]) => void
  onVariantAdded: (newTag: string[]) => void
  onVariantRemoved: (index: number) => void
  thumbnailUrls: string[]
  blurhash?: string
  writeRelays?: string[]
  videoEventInfo?: {
    id: string
    kind: number
    pubkey: string
    dTag?: string
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function truncateUrl(url: string, maxLen = 40): string {
  if (url.length <= maxLen) return url
  return url.slice(0, 20) + '...' + url.slice(-10)
}

export function VideoVariantsList({
  imetaTags,
  onVariantReplaced,
  onVariantAdded,
  onVariantRemoved,
  thumbnailUrls,
  blurhash,
  writeRelays,
  videoEventInfo,
}: VideoVariantsListProps) {
  const { t } = useTranslation()
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [removeIndex, setRemoveIndex] = useState<number | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t('editVideo.videoFiles')}</span>
        <span className="text-xs text-muted-foreground">
          {imetaTags.length} {imetaTags.length === 1 ? 'variant' : 'variants'}
        </span>
      </div>

      {imetaTags.length === 0 && (
        <div className="text-sm text-muted-foreground italic py-2">{t('editVideo.noVariants')}</div>
      )}

      {imetaTags.map((imeta, index) => (
        <div key={index}>
          {/* Variant card */}
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <div className="flex-1 min-w-0 space-y-1">
              {/* Quality badge + dimensions + codec */}
              <div className="flex items-center gap-2 flex-wrap">
                {imeta.quality && (
                  <Badge variant="secondary" className="text-xs">
                    {imeta.quality}
                  </Badge>
                )}
                {imeta.dimensions && (
                  <span className="text-xs text-muted-foreground">{imeta.dimensions}</span>
                )}
                {imeta.mimeType && (
                  <span className="text-xs text-muted-foreground">{imeta.mimeType}</span>
                )}
                {imeta.size && (
                  <span className="text-xs text-muted-foreground">
                    <HardDrive className="inline h-3 w-3 mr-0.5" />
                    {formatBytes(imeta.size)}
                  </span>
                )}
              </div>

              {/* Primary URL */}
              <div className="flex items-center gap-1">
                <LinkIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground truncate" title={imeta.url}>
                  {truncateUrl(imeta.url)}
                </span>
              </div>

              {/* Fallback count */}
              {imeta.fallbackUrls.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {t('editVideo.fallbackUrls', { count: imeta.fallbackUrls.length })}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-1 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPreviewIndex(previewIndex === index ? null : index)}
                title={t('editVideo.preview')}
              >
                <Play className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setReplacingIndex(replacingIndex === index ? null : index)}
                disabled={isAdding}
                title={t('editVideo.replace')}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
              </Button>
              {imetaTags.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => setRemoveIndex(index)}
                  title={t('editVideo.removeVariant')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Inline preview */}
          {previewIndex === index && (
            <div className="mt-2 rounded-lg overflow-hidden bg-black">
              <video src={imeta.url} controls className="w-full max-h-48" preload="metadata" />
            </div>
          )}

          {/* Inline replace flow */}
          {replacingIndex === index && (
            <div className="mt-2">
              <ReplaceVideoFlow
                originalImeta={imeta}
                thumbnailUrls={thumbnailUrls}
                blurhash={blurhash}
                writeRelays={writeRelays}
                videoEventInfo={videoEventInfo}
                onComplete={newTag => {
                  onVariantReplaced(index, newTag)
                  setReplacingIndex(null)
                }}
                onCancel={() => setReplacingIndex(null)}
              />
            </div>
          )}
        </div>
      ))}

      {/* Add variant flow */}
      {isAdding ? (
        <ReplaceVideoFlow
          thumbnailUrls={thumbnailUrls}
          blurhash={blurhash}
          writeRelays={writeRelays}
          videoEventInfo={videoEventInfo}
          onComplete={newTag => {
            onVariantAdded(newTag)
            setIsAdding(false)
          }}
          onCancel={() => setIsAdding(false)}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setIsAdding(true)}
          disabled={replacingIndex !== null}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t('editVideo.addVariant')}
        </Button>
      )}

      {/* Remove variant confirmation dialog */}
      <AlertDialog
        open={removeIndex !== null}
        onOpenChange={open => {
          if (!open) setRemoveIndex(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('editVideo.removeVariant')}</AlertDialogTitle>
            <AlertDialogDescription>{t('editVideo.removeVariantConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removeIndex !== null) {
                  onVariantRemoved(removeIndex)
                  setRemoveIndex(null)
                }
              }}
            >
              {t('editVideo.removeVariant')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
