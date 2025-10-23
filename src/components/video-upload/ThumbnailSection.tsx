import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { FileDropzone } from './FileDropzone'
import { UploadServer } from '../UploadServer'
import { BlobDescriptor } from 'blossom-client-sdk'

interface ThumbnailSectionProps {
  thumbnailSource: 'generated' | 'upload'
  onThumbnailSourceChange: (source: 'generated' | 'upload') => void
  thumbnailBlob: Blob | null
  thumbnailUrl?: string
  onThumbnailDrop: (files: File[]) => void
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
  thumbnailUploadInfo,
}: ThumbnailSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="thumbnail">Thumbnail</Label>
      <RadioGroup
        value={thumbnailSource}
        onValueChange={onThumbnailSourceChange}
        className="flex gap-4 mb-2"
        aria-label="Thumbnail source"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="generated" id="generated-thumb" />
          <Label htmlFor="generated-thumb">Use generated thumbnail</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="upload" id="upload-thumb" />
          <Label htmlFor="upload-thumb">Upload custom thumbnail</Label>
        </div>
      </RadioGroup>

      {thumbnailSource === 'generated' && thumbnailBlob && (
        <div className="">
          <img
            src={thumbnailUrl}
            alt="Generated thumbnail"
            className="rounded border mt-2 max-h-80"
          />
        </div>
      )}

      {thumbnailSource === 'upload' && (
        <div className="mb-2">
          <FileDropzone onDrop={onThumbnailDrop} accept={{ 'image/*': [] }} className="h-24 mb-4" />

          {thumbnailUploadInfo.error && (
            <div className="text-red-600 text-sm mt-2">{thumbnailUploadInfo.error}</div>
          )}

          <UploadServer
            inputMethod="file"
            uploadState={thumbnailUploadInfo.uploading ? 'uploading' : 'finished'}
            uploadedBlobs={thumbnailUploadInfo.uploadedBlobs}
            mirroredBlobs={thumbnailUploadInfo.mirroredBlobs}
            hasInitialUploadServers={true}
            forceShow={
              thumbnailUploadInfo.uploadedBlobs.length > 0 ||
              thumbnailUploadInfo.mirroredBlobs.length > 0
            }
          />
        </div>
      )}
    </div>
  )
}
