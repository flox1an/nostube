import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TestApp } from '@/test/TestApp'
import { UploadSourceScreen } from './UploadSourceScreen'
import type { UploadSourceScreenProps } from './UploadSourceScreen'
import type { BrowserTranscodeState } from '@/types/upload-draft'

function noop() {}
async function asyncNoop() {}

const baseState: BrowserTranscodeState = {
  status: 'transcoding',
  mode: 'replace',
  keepOriginal: false,
  sourceName: 'video.mov',
  sourceSize: 100 * 1024 * 1024,
  startedAt: Date.now() - 10_000,
  updatedAt: Date.now(),
  variants: [{ label: '720p', progress: 0.5, status: 'active' }],
}

function makeProps(overrides: Partial<UploadSourceScreenProps> = {}): UploadSourceScreenProps {
  return {
    draftId: 'draft-1',
    file: null,
    videoUrl: '',
    setVideoUrl: noop,
    inputMethod: 'file',
    setInputMethod: noop,
    uploadState: 'initial',
    uploadInfo: { videos: [] },
    uploadProgress: null,
    browserTranscodeState: undefined,
    originalVideoInfo: undefined,
    deletingIndex: null,
    hasHlsVideo: false,
    uploadServerCount: 1,
    mirrorServerCount: 0,
    onFileDrop: noop,
    onUrlProcess: noop,
    onStartBackground: asyncNoop,
    onCancelBackground: noop,
    onBrowserTranscodeComplete: noop,
    onBrowserTranscodeSkip: noop,
    onConfigureServers: noop,
    onRemoveVideo: noop,
    onAddAdditional: noop,
    onAddTranscodedVideo: noop,
    onStatusChange: noop,
    ...overrides,
  }
}

function renderScreen(overrides: Partial<UploadSourceScreenProps> = {}) {
  return render(
    <TestApp>
      <UploadSourceScreen {...makeProps(overrides)} />
    </TestApp>
  )
}

describe('UploadSourceScreen recovery states', () => {
  it('locks source selection and shows running copy for a genuinely active job', () => {
    renderScreen({ browserTranscodeState: baseState })

    expect(screen.getByText(/processing continues in the background/i)).toBeInTheDocument()
    expect(screen.getByText('video.mov')).toBeInTheDocument()
  })

  it('does not lock source selection or claim to still be running for a failed job', () => {
    renderScreen({
      browserTranscodeState: { ...baseState, status: 'error', error: 'boom' },
    })

    expect(screen.queryByText(/processing continues in the background/i)).not.toBeInTheDocument()
  })

  it('asks the viewer to reselect the source file when a failed job has none in memory', () => {
    const onFileDrop = vi.fn()
    renderScreen({
      browserTranscodeState: { ...baseState, status: 'error', error: 'boom' },
      file: null,
      onFileDrop,
    })

    expect(screen.getByText(/needs to be reselected/i)).toBeInTheDocument()
  })

  it('does not ask for reselection when a failed job still has its source file', () => {
    const file = new File(['x'], 'video.mov', { type: 'video/quicktime' })
    renderScreen({
      browserTranscodeState: { ...baseState, status: 'error', error: 'boom' },
      file,
      uploadState: 'transcoding',
    })

    expect(screen.queryByText(/needs to be reselected/i)).not.toBeInTheDocument()
  })
})
