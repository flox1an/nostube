import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProcessingRail } from './ProcessingRail'
import { TestApp } from '@/test/TestApp'
import type { BrowserTranscodeState } from '@/types/upload-draft'
import type { VideoVariant } from '@/lib/video-processing'
import type { ProcessingRailProps } from './ProcessingRail'

vi.mock('./VideoFilesPanel', () => ({
  VideoFilesPanel: ({ videos }: { videos: VideoVariant[] }) => (
    <div data-testid="video-files-panel" data-count={videos.length} />
  ),
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

const baseState: BrowserTranscodeState = {
  status: 'transcoding',
  mode: 'replace',
  keepOriginal: false,
  sourceName: 'video.mov',
  sourceSize: 100,
  startedAt: Date.now() - 10_000,
  updatedAt: Date.now(),
  variants: [{ label: '720p', progress: 0.5, status: 'active' }],
}

function renderRail(overrides: Partial<ProcessingRailProps> = {}) {
  return render(
    <TestApp>
      <ProcessingRail
        draftId="draft-1"
        browserTranscodeState={baseState}
        uploadState="transcoding"
        uploadProgress={null}
        videos={[]}
        deletingIndex={null}
        hasHlsVideo={false}
        onCancel={vi.fn()}
        onAdjust={vi.fn()}
        onChangeSettings={vi.fn()}
        onRetry={vi.fn()}
        hasSourceFile={true}
        onRemoveVideo={vi.fn()}
        onAddAdditional={vi.fn()}
        onAddTranscodedVideo={vi.fn()}
        onStatusChange={vi.fn()}
        {...overrides}
      />
    </TestApp>
  )
}

describe('ProcessingRail', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows active processing progress', () => {
    renderRail()
    expect(screen.getByText('Processing...')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('confirms cancellation only during browser upload phase', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onCancel = vi.fn()
    renderRail({
      browserTranscodeState: {
        ...baseState,
        status: 'uploading',
        uploadProgress: {
          percentage: 25,
          uploadedBytes: 25,
          totalBytes: 100,
          currentChunk: 1,
          totalChunks: 4,
        },
      },
      onCancel,
    })

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(confirm).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('shows what the job produces and asks before Adjust throws encoded progress away', () => {
    const onAdjust = vi.fn()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderRail({ onAdjust })
    expect(screen.getByText('720p')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /adjust/i }))
    expect(confirm).toHaveBeenCalledOnce()
    expect(onAdjust).toHaveBeenCalledTimes(1)
  })

  it('keeps the settings when Adjust is declined', () => {
    const onAdjust = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderRail({ onAdjust })
    fireEvent.click(screen.getByRole('button', { name: /adjust/i }))
    expect(onAdjust).not.toHaveBeenCalled()
  })

  it('adjusts without asking before any progress exists', () => {
    const onAdjust = vi.fn()
    const confirm = vi.spyOn(window, 'confirm')
    renderRail({
      browserTranscodeState: {
        ...baseState,
        variants: [{ label: '720p', progress: 0, status: 'active' }],
      },
      onAdjust,
    })
    fireEvent.click(screen.getByRole('button', { name: /adjust/i }))
    expect(confirm).not.toHaveBeenCalled()
    expect(onAdjust).toHaveBeenCalledTimes(1)
  })

  it('shows a plain-language error with Retry when a direct upload failed', () => {
    const onRetry = vi.fn()
    renderRail({
      browserTranscodeState: undefined,
      uploadState: 'initial',
      error: 'blossom.example could not be reached.',
      onRetry,
    })
    expect(screen.getByRole('alert')).toHaveTextContent('blossom.example could not be reached.')
    fireEvent.click(screen.getByRole('button', { name: /^retry$/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('cancels transcoding without confirmation', () => {
    const confirm = vi.spyOn(window, 'confirm')
    const onCancel = vi.fn()
    renderRail({ onCancel })

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(confirm).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('shows change-settings action after error', () => {
    const onChangeSettings = vi.fn()
    renderRail({
      browserTranscodeState: { ...baseState, status: 'error', error: 'Failed' },
      onChangeSettings,
    })

    fireEvent.click(screen.getByRole('button', { name: /change settings/i }))
    expect(onChangeSettings).toHaveBeenCalledOnce()
  })

  it('retries with retained settings distinctly from changing settings', () => {
    const onRetry = vi.fn()
    const onChangeSettings = vi.fn()
    renderRail({
      browserTranscodeState: { ...baseState, status: 'error', error: 'Failed' },
      onRetry,
      onChangeSettings,
    })

    fireEvent.click(screen.getByRole('button', { name: /^retry$/i }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(onChangeSettings).not.toHaveBeenCalled()
  })

  it('offers only reselection, not retry, when the source file is missing', () => {
    const onRetry = vi.fn()
    const onChangeSettings = vi.fn()
    renderRail({
      browserTranscodeState: { ...baseState, status: 'error', error: 'Failed' },
      hasSourceFile: false,
      onRetry,
      onChangeSettings,
    })

    expect(screen.queryByRole('button', { name: /^retry$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /change settings/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /reselect file/i }))
    expect(onChangeSettings).toHaveBeenCalledOnce()
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('renders VideoFilesPanel after completion', () => {
    renderRail({
      browserTranscodeState: { ...baseState, status: 'complete' },
      uploadState: 'finished',
      videos: [video],
    })

    expect(screen.getByTestId('video-files-panel')).toHaveAttribute('data-count', '1')
  })
})
