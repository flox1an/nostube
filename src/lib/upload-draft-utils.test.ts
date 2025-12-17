import { describe, it, expect } from 'vitest'
import { getSmartStatus } from './upload-draft-utils'
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
      thumbnailSource: 'generated'
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
        videos: [{
          inputMethod: 'file',
          dimension: '1920x1080',
          duration: 120,
          sizeMB: 100,
          uploadedBlobs: [{ url: 'http://test.com/video', sha256: 'abc', size: 100, type: 'video/mp4', uploaded: Date.now() }],
          mirroredBlobs: []
        }]
      },
      thumbnailUploadInfo: { uploadedBlobs: [{ url: 'http://test.com/thumb', sha256: 'def', size: 10, type: 'image/jpeg', uploaded: Date.now() }], mirroredBlobs: [] },
      thumbnailSource: 'generated'
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
        videos: [{
          inputMethod: 'file',
          dimension: '1920x1080',
          duration: 120,
          sizeMB: 100,
          uploadedBlobs: [{ url: 'http://test.com/video', sha256: 'abc', size: 100, type: 'video/mp4', uploaded: Date.now() }],
          mirroredBlobs: []
        }]
      },
      thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
      thumbnailSource: 'generated'
    }
    expect(getSmartStatus(draft)).toBe('upload.draft.status.addThumbnail')
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
        videos: [{
          inputMethod: 'file',
          dimension: '1920x1080',
          duration: 120,
          sizeMB: 100,
          uploadedBlobs: [{ url: 'http://test.com/video', sha256: 'abc', size: 100, type: 'video/mp4', uploaded: Date.now() }],
          mirroredBlobs: []
        }]
      },
      thumbnailUploadInfo: { uploadedBlobs: [{ url: 'http://test.com/thumb', sha256: 'def', size: 10, type: 'image/jpeg', uploaded: Date.now() }], mirroredBlobs: [] },
      thumbnailSource: 'generated'
    }
    expect(getSmartStatus(draft)).toBe('upload.draft.status.ready')
  })
})
