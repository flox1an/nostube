import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TestApp } from '@/test/TestApp'
import { UploadDetailsScreen } from './UploadDetailsScreen'
import type { UploadDetailsScreenProps } from './UploadDetailsScreen'
import type { VideoVariant } from '@/lib/video-processing'

// Stub heavy subtrees we are not exercising here
vi.mock('./ProcessingRail', () => ({
  ProcessingRail: () => <div data-testid="processing-rail" />,
}))
vi.mock('./BrowserTranscodeStep', () => ({
  BrowserTranscodeStep: ({ file }: { file: File | null }) => (
    <div data-testid="browser-transcode-step" data-file={file?.name ?? ''} />
  ),
}))
vi.mock('./FormFields', () => ({ FormFields: () => <div data-testid="form-fields" /> }))
vi.mock('./ThumbnailSection', () => ({ ThumbnailSection: () => <div data-testid="thumbnail" /> }))
vi.mock('./SubtitleSection', () => ({ SubtitleSection: () => null }))
vi.mock('./PublishDateSection', () => ({ PublishDateSection: () => null }))
vi.mock('./ContentWarning', () => ({ ContentWarning: () => null }))
vi.mock('./ExpirationSection', () => ({ ExpirationSection: () => null }))
vi.mock('./PeoplePickerSection', () => ({ PeoplePickerSection: () => null }))
vi.mock('./OriginManager', () => ({ OriginManager: () => null }))

const baseVideo: VideoVariant = {
  url: 'https://example.com/video.mp4',
  mimeType: 'video/mp4',
  dimension: '1280x720',
  duration: 60,
  inputMethod: 'url',
  uploadedBlobs: [],
  mirroredBlobs: [],
  placement: { fallbackBlobs: [], directUrl: 'https://example.com/video.mp4' },
}

function noop() {}
async function asyncNoop() {}

function makeProps(overrides: Partial<UploadDetailsScreenProps> = {}): UploadDetailsScreenProps {
  return {
    title: 'My video',
    setTitle: noop,
    description: '',
    setDescription: noop,
    tags: [],
    setTags: noop,
    language: 'en',
    setLanguage: noop,
    thumbnailSource: 'generated',
    onThumbnailSourceChange: noop,
    thumbnailBlob: null,
    onThumbnailDrop: noop,
    onAutoThumbnailCapture: noop,
    onDeleteThumbnail: asyncNoop,
    thumbnailUploadInfo: { uploadedBlobs: [], mirroredBlobs: [], uploading: false },
    file: null,
    videoUrl: '',
    uploadInfo: { videos: [baseVideo] },
    subtitles: [],
    onSubtitleDrop: noop,
    onRemoveSubtitle: asyncNoop,
    onSubtitleLanguageChange: noop,
    subtitleUploading: false,
    publishAt: undefined,
    setPublishAt: noop,
    contentWarningEnabled: false,
    setContentWarningEnabled: noop,
    contentWarningReason: '',
    setContentWarningReason: noop,
    expiration: 'none',
    setExpiration: noop,
    people: [],
    setPeople: noop,
    origins: [],
    setOrigins: noop,
    draftId: 'draft-1',
    videos: [baseVideo],
    uploadState: 'finished',
    uploadProgress: null,
    browserTranscodeState: undefined,
    deletingIndex: null,
    hasHlsVideo: false,
    onRemoveVideo: noop,
    onAddAdditional: noop,
    onAddTranscodedVideo: noop,
    onStatusChange: noop,
    onChangeSettings: noop,
    onCancelProcessing: noop,
    onStartBackground: asyncNoop,
    onBrowserTranscodeComplete: noop,
    onBrowserTranscodeSkip: noop,
    ...overrides,
  }
}

function renderScreen(overrides: Partial<UploadDetailsScreenProps> = {}) {
  return render(
    <TestApp>
      <UploadDetailsScreen {...makeProps(overrides)} />
    </TestApp>
  )
}

describe('UploadDetailsScreen', () => {
  it('renders the ProcessingRail when no additional file is being analysed', () => {
    renderScreen()
    expect(screen.getByTestId('processing-rail')).toBeInTheDocument()
    expect(screen.queryByTestId('browser-transcode-step')).not.toBeInTheDocument()
  })

  it('shows BrowserTranscodeStep when an additional file is queued for transcoding', () => {
    // Reproduces the original bug: user clicked "Add another quality" on Details
    // and picked a file. handleAddVideo sets uploadState='transcoding' and a file,
    // without a browserTranscodeState yet. Previously the rail returned null and
    // the picker was nowhere on the screen, stranding the user.
    const file = new File(['x'], 'original.mp4', { type: 'video/mp4' })
    renderScreen({ file, uploadState: 'transcoding', browserTranscodeState: undefined })

    const step = screen.getByTestId('browser-transcode-step')
    expect(step).toHaveAttribute('data-file', 'original.mp4')
    expect(screen.queryByTestId('processing-rail')).not.toBeInTheDocument()
  })

  it('falls back to ProcessingRail once a background transcode job exists', () => {
    const file = new File(['x'], 'original.mp4', { type: 'video/mp4' })
    renderScreen({
      file,
      uploadState: 'transcoding',
      browserTranscodeState: {
        status: 'transcoding',
        mode: 'append',
        keepOriginal: false,
        sourceName: 'original.mp4',
        sourceSize: 1,
        startedAt: Date.now(),
        updatedAt: Date.now(),
        variants: [],
      },
    })

    expect(screen.getByTestId('processing-rail')).toBeInTheDocument()
    expect(screen.queryByTestId('browser-transcode-step')).not.toBeInTheDocument()
  })
})
