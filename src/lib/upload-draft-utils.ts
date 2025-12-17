import type { UploadDraft } from '@/types/upload-draft'

export function getSmartStatus(draft: UploadDraft): string {
  if (draft.uploadInfo.videos.length === 0) {
    return 'upload.draft.status.addVideo'
  }

  if (!draft.title || draft.title.trim() === '') {
    return 'upload.draft.status.addTitle'
  }

  if (draft.thumbnailUploadInfo.uploadedBlobs.length === 0) {
    return 'upload.draft.status.addThumbnail'
  }

  return 'upload.draft.status.ready'
}
