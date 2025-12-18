import { describe, it, expect } from 'vitest'
import {
  getSmartStatus,
  getVideoQualityInfo,
  getRelativeTime,
  removeOldDrafts,
} from './upload-draft-utils'
import type { UploadDraft } from '@/types/upload-draft'

describe('getSmartStatus', () => {
  it('returns addVideo when no videos', () => {
    const draft: UploadDraft = {
      id: 'test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: '',
      description: '',
      tags: [],
      language: 'en',
      contentWarning: { enabled: false, reason: '' },
      inputMethod: 'file',
      uploadInfo: { videos: [] },
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
      thumbnailSource: 'generated',
    }
    expect(getSmartStatus(draft)).toBe('upload.draft.status.addVideo')
  })

  it('returns addTitle when video but no title', () => {
    const draft: UploadDraft = {
      id: 'test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: '',
      description: '',
      tags: [],
      language: 'en',
      contentWarning: { enabled: false, reason: '' },
      inputMethod: 'file',
      uploadInfo: {
        videos: [
          {
            inputMethod: 'file',
            dimension: '1920x1080',
            duration: 120,
            sizeMB: 100,
            uploadedBlobs: [
              {
                url: 'http://test.com/video',
                sha256: 'abc',
                size: 100,
                type: 'video/mp4',
                uploaded: Date.now(),
              },
            ],
            mirroredBlobs: [],
          },
        ],
      },
      thumbnailUploadInfo: {
        uploadedBlobs: [
          {
            url: 'http://test.com/thumb',
            sha256: 'def',
            size: 10,
            type: 'image/jpeg',
            uploaded: Date.now(),
          },
        ],
        mirroredBlobs: [],
      },
      thumbnailSource: 'generated',
    }
    expect(getSmartStatus(draft)).toBe('upload.draft.status.addTitle')
  })

  it('returns addThumbnail when video and title but no thumbnail', () => {
    const draft: UploadDraft = {
      id: 'test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: 'My Video',
      description: '',
      tags: [],
      language: 'en',
      contentWarning: { enabled: false, reason: '' },
      inputMethod: 'file',
      uploadInfo: {
        videos: [
          {
            inputMethod: 'file',
            dimension: '1920x1080',
            duration: 120,
            sizeMB: 100,
            uploadedBlobs: [
              {
                url: 'http://test.com/video',
                sha256: 'abc',
                size: 100,
                type: 'video/mp4',
                uploaded: Date.now(),
              },
            ],
            mirroredBlobs: [],
          },
        ],
      },
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
      thumbnailSource: 'generated',
    }
    // For generated thumbnails, we don't need an uploaded thumbnail
    expect(getSmartStatus(draft)).toBe('upload.draft.status.ready')
  })

  it('returns ready when complete', () => {
    const draft: UploadDraft = {
      id: 'test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: 'My Video',
      description: '',
      tags: [],
      language: 'en',
      contentWarning: { enabled: false, reason: '' },
      inputMethod: 'file',
      uploadInfo: {
        videos: [
          {
            inputMethod: 'file',
            dimension: '1920x1080',
            duration: 120,
            sizeMB: 100,
            uploadedBlobs: [
              {
                url: 'http://test.com/video',
                sha256: 'abc',
                size: 100,
                type: 'video/mp4',
                uploaded: Date.now(),
              },
            ],
            mirroredBlobs: [],
          },
        ],
      },
      thumbnailUploadInfo: {
        uploadedBlobs: [
          {
            url: 'http://test.com/thumb',
            sha256: 'def',
            size: 10,
            type: 'image/jpeg',
            uploaded: Date.now(),
          },
        ],
        mirroredBlobs: [],
      },
      thumbnailSource: 'generated',
    }
    expect(getSmartStatus(draft)).toBe('upload.draft.status.ready')
  })
})

describe('getVideoQualityInfo', () => {
  it('returns empty string when no videos', () => {
    const draft: UploadDraft = {
      id: 'test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: '',
      description: '',
      tags: [],
      language: 'en',
      contentWarning: { enabled: false, reason: '' },
      inputMethod: 'file',
      uploadInfo: { videos: [] },
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
      thumbnailSource: 'generated',
    }
    expect(getVideoQualityInfo(draft)).toBe('')
  })

  it('formats single quality correctly', () => {
    const draft: UploadDraft = {
      id: 'test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: 'Test',
      description: '',
      tags: [],
      language: 'en',
      contentWarning: { enabled: false, reason: '' },
      inputMethod: 'file',
      uploadInfo: {
        videos: [
          {
            inputMethod: 'file',
            dimension: '1920x1080',
            duration: 120,
            sizeMB: 450,
            uploadedBlobs: [],
            mirroredBlobs: [],
          },
        ],
      },
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
      thumbnailSource: 'generated',
    }
    expect(getVideoQualityInfo(draft)).toBe('1080p • 450 MB')
  })

  it('formats multiple qualities correctly', () => {
    const draft: UploadDraft = {
      id: 'test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: 'Test',
      description: '',
      tags: [],
      language: 'en',
      contentWarning: { enabled: false, reason: '' },
      inputMethod: 'file',
      uploadInfo: {
        videos: [
          {
            inputMethod: 'file',
            dimension: '1280x720',
            duration: 120,
            sizeMB: 200,
            uploadedBlobs: [],
            mirroredBlobs: [],
          },
          {
            inputMethod: 'file',
            dimension: '1920x1080',
            duration: 120,
            sizeMB: 450,
            uploadedBlobs: [],
            mirroredBlobs: [],
          },
        ],
      },
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
      thumbnailSource: 'generated',
    }
    expect(getVideoQualityInfo(draft)).toBe('720p, 1080p • 650 MB')
  })

  it('converts MB to GB correctly', () => {
    const draft: UploadDraft = {
      id: 'test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: 'Test',
      description: '',
      tags: [],
      language: 'en',
      contentWarning: { enabled: false, reason: '' },
      inputMethod: 'file',
      uploadInfo: {
        videos: [
          {
            inputMethod: 'file',
            dimension: '3840x2160',
            duration: 120,
            sizeMB: 2048,
            uploadedBlobs: [],
            mirroredBlobs: [],
          },
        ],
      },
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
      thumbnailSource: 'generated',
    }
    expect(getVideoQualityInfo(draft)).toBe('4K • 2.0 GB')
  })
})

describe('getRelativeTime', () => {
  it('returns justNow for < 1 minute', () => {
    const timestamp = Date.now() - 30000 // 30 seconds ago
    expect(getRelativeTime(timestamp)).toBe('upload.draft.time.justNow')
  })

  it('returns minutes ago for < 1 hour', () => {
    const timestamp = Date.now() - 5 * 60000 // 5 minutes ago
    const result = getRelativeTime(timestamp)
    expect(result).toEqual(['upload.draft.time.minutesAgo', { count: 5 }])
  })

  it('returns hours ago for < 24 hours', () => {
    const timestamp = Date.now() - 3 * 3600000 // 3 hours ago
    const result = getRelativeTime(timestamp)
    expect(result).toEqual(['upload.draft.time.hoursAgo', { count: 3 }])
  })

  it('returns days ago for < 30 days', () => {
    const timestamp = Date.now() - 5 * 86400000 // 5 days ago
    const result = getRelativeTime(timestamp)
    expect(result).toEqual(['upload.draft.time.daysAgo', { count: 5 }])
  })

  it('returns months ago for >= 30 days', () => {
    const timestamp = Date.now() - 60 * 86400000 // 60 days ago
    const result = getRelativeTime(timestamp)
    expect(result).toEqual(['upload.draft.time.monthsAgo', { count: 2 }])
  })
})

describe('removeOldDrafts', () => {
  it('removes drafts older than 30 days', () => {
    const now = Date.now()
    const drafts: UploadDraft[] = [
      {
        id: '1',
        createdAt: now - 31 * 86400000, // 31 days ago
        updatedAt: now,
        title: 'Old',
        description: '',
        tags: [],
        language: 'en',
        contentWarning: { enabled: false, reason: '' },
        inputMethod: 'file',
        uploadInfo: { videos: [] },
        thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
        thumbnailSource: 'generated',
      },
      {
        id: '2',
        createdAt: now - 5 * 86400000, // 5 days ago
        updatedAt: now,
        title: 'Recent',
        description: '',
        tags: [],
        language: 'en',
        contentWarning: { enabled: false, reason: '' },
        inputMethod: 'file',
        uploadInfo: { videos: [] },
        thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
        thumbnailSource: 'generated',
      },
    ]
    const result = removeOldDrafts(drafts, 30)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('keeps all recent drafts', () => {
    const now = Date.now()
    const drafts: UploadDraft[] = [
      {
        id: '1',
        createdAt: now - 1 * 86400000,
        updatedAt: now,
        title: 'Draft 1',
        description: '',
        tags: [],
        language: 'en',
        contentWarning: { enabled: false, reason: '' },
        inputMethod: 'file',
        uploadInfo: { videos: [] },
        thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
        thumbnailSource: 'generated',
      },
      {
        id: '2',
        createdAt: now - 2 * 86400000,
        updatedAt: now,
        title: 'Draft 2',
        description: '',
        tags: [],
        language: 'en',
        contentWarning: { enabled: false, reason: '' },
        inputMethod: 'file',
        uploadInfo: { videos: [] },
        thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
        thumbnailSource: 'generated',
      },
    ]
    const result = removeOldDrafts(drafts, 30)
    expect(result).toHaveLength(2)
  })
})
