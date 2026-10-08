import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { VideoFilesPanel } from './VideoFilesPanel'
import { TestApp } from '@/test/TestApp'
import type { VideoVariant } from '@/lib/video-processing'
import type { VideoFilesPanelProps } from './VideoFilesPanel'

// Keep DvmTranscodeAlert as a stub — it makes network calls
vi.mock('./DvmTranscodeAlert', () => ({
  DvmTranscodeAlert: ({ draftId }: { draftId: string }) => (
    <div data-testid="dvm-transcode-alert" data-draft-id={draftId} />
  ),
}))
// VideoVariantsTable stub
vi.mock('./VideoVariantsTable', () => ({
  VideoVariantsTable: ({ videos }: { videos: VideoVariant[] }) => (
    <div data-testid="video-variants-table" data-count={videos.length} />
  ),
}))

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

const hlsVideo: VideoVariant = {
  url: 'https://example.com/playlist.m3u8',
  mimeType: 'application/vnd.apple.mpegurl',
  dimension: '1280x720',
  duration: 60,
  inputMethod: 'url',
  uploadedBlobs: [],
  mirroredBlobs: [],
  placement: { fallbackBlobs: [], directUrl: 'https://example.com/playlist.m3u8' },
}

function renderPanel(overrides: Partial<VideoFilesPanelProps> = {}) {
  return render(
    <TestApp>
      <VideoFilesPanel
        draftId="draft-1"
        videos={[baseVideo]}
        uploadState="finished"
        uploadProgress={null}
        deletingIndex={null}
        hasHlsVideo={false}
        onRemove={vi.fn()}
        onAddAdditional={vi.fn()}
        onComplete={vi.fn()}
        onStatusChange={vi.fn()}
        {...overrides}
      />
    </TestApp>
  )
}

describe('VideoFilesPanel', () => {
  it('shows DvmTranscodeAlert when upload finished and no HLS', () => {
    renderPanel()
    expect(screen.getByTestId('dvm-transcode-alert')).toBeInTheDocument()
  })

  it('hides DvmTranscodeAlert when HLS variant exists', () => {
    renderPanel({ hasHlsVideo: true, videos: [hlsVideo] })
    expect(screen.queryByTestId('dvm-transcode-alert')).not.toBeInTheDocument()
  })

  it('shows add-another-quality button when finished and no HLS', () => {
    renderPanel()
    // i18n key rendered as-is in test environment (no upload translations loaded)
    expect(screen.getByText('upload.addAnotherQuality')).toBeInTheDocument()
  })

  it('hides add-another-quality button when HLS variant exists', () => {
    renderPanel({ hasHlsVideo: true, videos: [hlsVideo] })
    expect(screen.queryByText('upload.addAnotherQuality')).not.toBeInTheDocument()
  })

  it('shows upload progress bar when uploadProgress provided', () => {
    renderPanel({
      uploadState: 'uploading',
      uploadProgress: {
        percentage: 55,
        uploadedBytes: 55,
        totalBytes: 100,
        currentChunk: 0,
        totalChunks: 1,
      },
    })
    expect(screen.getByText('55%')).toBeInTheDocument()
  })

  it('shows spinner when uploading without progress', () => {
    renderPanel({ uploadState: 'uploading', uploadProgress: null, videos: [] })
    expect(screen.getByText(/uploading/i)).toBeInTheDocument()
  })

  it('does not show DvmTranscodeAlert when upload not finished', () => {
    renderPanel({ uploadState: 'uploading' })
    expect(screen.queryByTestId('dvm-transcode-alert')).not.toBeInTheDocument()
  })
})
