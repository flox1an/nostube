import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoUpload } from './VideoUpload'
import { makeVideoUploadState, type VideoUploadStateStub } from '@/test/makeVideoUploadState'
import type { UploadDraft } from '@/types/upload-draft'
import type { VideoVariant } from '@/lib/video-processing'

let uploadStateStub: VideoUploadStateStub

vi.mock('@/hooks', () => ({
  useCurrentUser: () => ({
    user: {
      pubkey: 'pubkey',
      signer: { signEvent: vi.fn(async event => event) },
    },
  }),
  useVideoUpload: () => uploadStateStub,
  useAppContext: () => ({
    config: { blossomServers: [], relays: [] },
    updateConfig: vi.fn(),
  }),
}))

vi.mock('@/hooks/useUploadDrafts', () => ({
  useUploadDrafts: () => ({
    updateDraft: vi.fn(),
    deleteDraft: vi.fn(),
  }),
}))

vi.mock('@/hooks/useUploadNotifications', () => ({
  useUploadNotifications: () => ({ removeByDraftId: vi.fn() }),
}))

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('@/lib/browser-transcode-upload-manager', () => ({
  getBrowserTranscodeUploadDraft: vi.fn(() => undefined),
}))

vi.mock('./video-upload/UploadSourceScreen', () => ({
  UploadSourceScreen: () => <div>Source screen marker</div>,
}))

vi.mock('./video-upload/UploadDetailsScreen', () => ({
  UploadDetailsScreen: () => <div>Details screen marker</div>,
}))

vi.mock('./video-upload/UploadReviewScreen', () => ({
  UploadReviewScreen: () => <div>Review screen marker</div>,
}))

vi.mock('./video-upload/UploadOnboardingDialog', () => ({
  UploadOnboardingDialog: () => null,
}))

vi.mock('./video-upload/DeleteVideoDialog', () => ({
  DeleteVideoDialog: () => null,
}))

vi.mock('./upload/DeleteDraftDialog', () => ({
  DeleteDraftDialog: () => null,
}))

vi.mock('./onboarding/BlossomOnboardingStep', () => ({
  BlossomOnboardingStep: () => null,
}))

vi.mock('./onboarding/BlossomServerPicker', () => ({
  BlossomServerPicker: () => null,
}))

const video: VideoVariant = {
  url: 'https://example.com/video.mp4',
  mimeType: 'video/mp4',
  dimension: '1280x720',
  duration: 60,
  inputMethod: 'url',
  uploadedBlobs: [],
  mirroredBlobs: [],
}

function makeDraft(overrides: Partial<UploadDraft> = {}): UploadDraft {
  return {
    id: 'draft-1',
    createdAt: 1,
    updatedAt: 1,
    title: '',
    description: '',
    tags: [],
    language: 'en',
    people: [],
    contentWarning: { enabled: false, reason: '' },
    expiration: 'none',
    inputMethod: 'file',
    uploadInfo: { videos: [] },
    thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [] },
    subtitles: [],
    thumbnailSource: 'generated',
    ...overrides,
  }
}

function renderUpload(draft: UploadDraft, route = '/upload') {
  uploadStateStub = makeVideoUploadState({
    inputMethod: draft.inputMethod,
    videoUrl: draft.videoUrl ?? '',
    uploadInfo: draft.uploadInfo,
    title: draft.title,
  })

  return render(
    <MemoryRouter initialEntries={[route]}>
      <VideoUpload draft={draft} />
    </MemoryRouter>
  )
}

describe('VideoUpload screen selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    uploadStateStub = makeVideoUploadState()
  })

  it('starts on Source for an empty draft', () => {
    renderUpload(makeDraft())
    expect(screen.getByText('Source screen marker')).toBeInTheDocument()
  })

  it('starts on Details for a draft with videos', () => {
    renderUpload(makeDraft({ uploadInfo: { videos: [video] } }))
    expect(screen.getByText('Details screen marker')).toBeInTheDocument()
  })

  it('clamps screen=review to Source when no video or URL exists', () => {
    renderUpload(makeDraft(), '/upload?screen=review')
    expect(screen.getByText('Source screen marker')).toBeInTheDocument()
  })

  it('maps legacy step=4 to Details when the draft can be edited', () => {
    renderUpload(makeDraft({ uploadInfo: { videos: [video] } }), '/upload?step=4')
    expect(screen.getByText('Details screen marker')).toBeInTheDocument()
  })

  it('maps legacy step=2 URL drafts to Details for imported notes', () => {
    renderUpload(
      makeDraft({ inputMethod: 'url', videoUrl: 'https://example.com/video.mp4' }),
      '/upload?step=2'
    )
    expect(screen.getByText('Details screen marker')).toBeInTheDocument()
  })

  it('never resumes directly into Review even when requested', () => {
    renderUpload(makeDraft({ uploadInfo: { videos: [video] } }), '/upload?screen=review')
    expect(screen.getByText('Details screen marker')).toBeInTheDocument()
  })
})
