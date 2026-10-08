import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoUpload } from './VideoUpload'
import { makeVideoUploadState, type VideoUploadStateStub } from '@/test/makeVideoUploadState'
import type { UploadDraft } from '@/types/upload-draft'
import type { VideoVariant } from '@/lib/video-processing'

let uploadStateStub: VideoUploadStateStub

const mocks = vi.hoisted(() => ({
  updateDraft: vi.fn(),
  toast: vi.fn(),
  currentUser: {
    pubkey: 'pubkey',
    signer: { signEvent: vi.fn(async event => event) },
  } as { pubkey: string; signer: unknown } | null,
}))

vi.mock('@/hooks', () => ({
  useCurrentUser: () => ({ user: mocks.currentUser }),
  useVideoUpload: () => uploadStateStub,
  useAppContext: () => ({
    config: { blossomServers: [], relays: [] },
    updateConfig: vi.fn(),
  }),
}))

vi.mock('@/hooks/useUploadDrafts', () => ({
  useUploadDrafts: () => ({
    updateDraft: mocks.updateDraft,
    deleteDraft: vi.fn(),
  }),
}))

vi.mock('@/hooks/useUploadNotifications', () => ({
  useUploadNotifications: () => ({ removeByDraftId: vi.fn() }),
}))

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast }),
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

vi.mock('./auth/AuthDialog', () => ({
  AuthDialog: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>Auth dialog marker</div> : null),
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
  placement: { fallbackBlobs: [], directUrl: 'https://example.com/video.mp4' },
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

function renderUpload(draft: UploadDraft, route = '/upload', onBack?: () => void) {
  uploadStateStub = makeVideoUploadState({
    inputMethod: draft.inputMethod,
    videoUrl: draft.videoUrl ?? '',
    uploadInfo: draft.uploadInfo,
    title: draft.title,
  })

  return render(
    <MemoryRouter initialEntries={[route]}>
      <VideoUpload draft={draft} onBack={onBack} />
    </MemoryRouter>
  )
}

describe('VideoUpload screen selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    uploadStateStub = makeVideoUploadState()
    mocks.currentUser = { pubkey: 'pubkey', signer: { signEvent: vi.fn(async event => event) } }
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

describe('VideoUpload Save Draft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    uploadStateStub = makeVideoUploadState()
    mocks.currentUser = { pubkey: 'pubkey', signer: { signEvent: vi.fn(async event => event) } }
  })

  it('persists the current edits and exits without regressing a wizard step', async () => {
    const onBack = vi.fn()
    renderUpload(makeDraft({ uploadInfo: { videos: [video] } }), '/upload', onBack)
    // Draft has a video, so it starts on Details, not Source.
    expect(screen.getByText('Details screen marker')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }))

    expect(mocks.updateDraft).toHaveBeenCalledWith('draft-1', expect.any(Object))
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/saved/i) })
    )
    await vi.waitFor(() => expect(onBack).toHaveBeenCalledTimes(1))
    // Still showing Details — Save Draft must not have bounced to Source first.
    expect(screen.getByText('Details screen marker')).toBeInTheDocument()
  })

  it('reports an honest error and stays open when persistence fails', () => {
    mocks.updateDraft.mockImplementationOnce(() => {
      throw new Error('storage quota exceeded')
    })
    const onBack = vi.fn()
    renderUpload(makeDraft({ uploadInfo: { videos: [video] } }), '/upload', onBack)

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }))

    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringMatching(/failed/i),
        variant: 'destructive',
      })
    )
    expect(onBack).not.toHaveBeenCalled()
  })
})

describe('VideoUpload signed-out entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    uploadStateStub = makeVideoUploadState()
    mocks.currentUser = null
  })

  it('shows an actionable creator welcome instead of the upload form', () => {
    renderUpload(makeDraft())
    expect(screen.queryByText('Source screen marker')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in to upload/i })).toBeInTheDocument()
  })

  it('opens sign-in on request and leaves the draft untouched', () => {
    renderUpload(makeDraft())
    expect(screen.queryByText('Auth dialog marker')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /sign in to upload/i }))

    expect(screen.getByText('Auth dialog marker')).toBeInTheDocument()
    expect(mocks.updateDraft).not.toHaveBeenCalled()
  })
})
