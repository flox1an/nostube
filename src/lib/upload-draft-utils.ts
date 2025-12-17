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

export function getVideoQualityInfo(draft: UploadDraft): string {
  if (draft.uploadInfo.videos.length === 0) return ''

  const qualities = draft.uploadInfo.videos.map(v => {
    const [, height] = v.dimension.split('x').map(Number)
    if (height >= 2160) return '4K'
    if (height >= 1440) return '1440p'
    if (height >= 1080) return '1080p'
    if (height >= 720) return '720p'
    if (height >= 480) return '480p'
    return '360p'
  })

  const totalSizeMB = draft.uploadInfo.videos.reduce((sum, v) => sum + (v.sizeMB || 0), 0)
  const sizeStr = totalSizeMB > 1024
    ? `${(totalSizeMB / 1024).toFixed(1)} GB`
    : `${Math.round(totalSizeMB)} MB`

  return `${qualities.join(', ')} • ${sizeStr}`
}

export function getRelativeTime(timestamp: number): string | [string, { count: number }] {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'upload.draft.time.justNow'
  if (minutes < 60) return ['upload.draft.time.minutesAgo', { count: minutes }]
  if (hours < 24) return ['upload.draft.time.hoursAgo', { count: hours }]
  if (days < 30) return ['upload.draft.time.daysAgo', { count: days }]
  return ['upload.draft.time.monthsAgo', { count: Math.floor(days / 30) }]
}

export function removeOldDrafts(drafts: UploadDraft[], maxAgeDays = 30): UploadDraft[] {
  const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000)
  return drafts.filter(d => d.createdAt > cutoffTime)
}
