import { useState } from 'react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { FileDropzone } from './FileDropzone'
import { UploadServer } from '../UploadServer'
import { type BlobDescriptor } from 'blossom-client-sdk'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'

interface ThumbnailSectionProps {
  thumbnailSource: 'generated' | 'upload'
  onThumbnailSourceChange: (source: 'generated' | 'upload') => void
  thumbnailBlob: Blob | null
  thumbnailUrl?: string
  onThumbnailDrop: (files: File[]) => void
  onDeleteThumbnail: () => Promise<void>
  isThumbDragActive: boolean
  thumbnailUploadInfo: {
    uploadedBlobs: BlobDescriptor[]
    mirroredBlobs: BlobDescriptor[]
    uploading: boolean
    error?: string
  }
}

export function ThumbnailSection({
  thumbnailSource,
  onThumbnailSourceChange,
  thumbnailBlob,
  thumbnailUrl,
  onThumbnailDrop,
  onDeleteThumbnail,
  thumbnailUploadInfo,
}: ThumbnailSectionProps) {
  const { t } = useTranslation()
  const [isDeleting, setIsDeleting] = useState(false)

  const hasUploadedThumbnail = thumbnailUploadInfo.uploadedBlobs.length > 0
  const uploadedThumbnailUrl = hasUploadedThumbnail
    ? thumbnailUploadInfo.uploadedBlobs[0].url
    : null

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await onDeleteThumbnail()
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="thumbnail">
        {t('upload.thumbnail.title')} <span className="text-destructive">*</span>
      </Label>
      <RadioGroup
        value={thumbnailSource}
        onValueChange={onThumbnailSourceChange}
        className="flex gap-4 mb-2"
        aria-label="Thumbnail source"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="generated" id="generated-thumb" />
          <Label htmlFor="generated-thumb">{t('upload.thumbnail.useGenerated')}</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="upload" id="upload-thumb" />
          <Label htmlFor="upload-thumb">{t('upload.thumbnail.uploadCustom')}</Label>
        </div>
      </RadioGroup>

      {thumbnailSource === 'generated' && thumbnailBlob && (
        <div className="">
          <img
            src={thumbnailUrl}
            alt={t('upload.thumbnail.generated')}
            className="rounded border mt-2 max-h-80"
          />
        </div>
      )}

      {thumbnailSource === 'upload' && (
        <div className="mb-2">
          {hasUploadedThumbnail && uploadedThumbnailUrl ? (
            <div className="relative inline-block">
              <img
                src={uploadedThumbnailUrl}
                alt={t('upload.thumbnail.uploaded', { defaultValue: 'Uploaded thumbnail' })}
                className="rounded border max-h-80"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <FileDropzone
                onDrop={onThumbnailDrop}
                accept={{ 'image/*': [] }}
                className="h-24 mb-4"
              />

              {thumbnailUploadInfo.uploading && (
                <div className="text-sm text-muted-foreground mt-2">
                  {t('upload.thumbnail.uploading', { defaultValue: 'Uploading thumbnail...' })}
                </div>
              )}
            </>
          )}

          {thumbnailUploadInfo.error && (
            <div className="text-red-600 text-sm mt-2">{thumbnailUploadInfo.error}</div>
          )}

          {hasUploadedThumbnail && (
            <UploadServer
              inputMethod="file"
              uploadState={thumbnailUploadInfo.uploading ? 'uploading' : 'finished'}
              uploadedBlobs={thumbnailUploadInfo.uploadedBlobs}
              mirroredBlobs={thumbnailUploadInfo.mirroredBlobs}
              hasInitialUploadServers={true}
              forceShow={true}
            />
          )}
        </div>
      )}
    </div>
  )
}
