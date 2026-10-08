import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BrowserTranscodeStep } from './BrowserTranscodeStep'
import type { TranscodeSourceMeta, ResolutionOption } from '@/lib/video-transcode'

vi.mock('./TranscodeVariantPicker', () => ({
  TranscodeVariantPicker: () => <div data-testid="variant-picker" />,
}))

const sourceMeta: TranscodeSourceMeta = {
  width: 1920,
  height: 1080,
  duration: 60,
  sizeMB: 200,
  bitrateMbps: 5,
  videoCodec: 'avc1',
  mimeType: 'video/mp4',
}

const availableResolutionOptions: ResolutionOption[] = [
  { height: 1080, suggestedCodec: 'avc' },
  { height: 720, suggestedCodec: 'avc' },
  { height: 480, suggestedCodec: 'avc' },
]

const mocks = vi.hoisted(() => ({ useVideoTranscode: vi.fn() }))
vi.mock('@/hooks/useVideoTranscode', () => ({ useVideoTranscode: mocks.useVideoTranscode }))

function mockWaitingState() {
  mocks.useVideoTranscode.mockReturnValue({
    status: 'waiting',
    sourceMeta,
    availableResolutionOptions,
    variantProgress: [],
    error: null,
    supported: true,
    analyze: vi.fn(),
    startTranscode: vi.fn(),
    cancel: vi.fn(),
  })
}

const file = new File(['x'], 'video.mp4', { type: 'video/mp4' })

describe('BrowserTranscodeStep recommended-defaults flow', () => {
  it('shows a concise recommended summary and lets the creator proceed without opening Advanced settings', () => {
    mockWaitingState()
    const onStartBackground = vi.fn().mockResolvedValue(undefined)

    render(
      <BrowserTranscodeStep
        file={file}
        onStartBackground={onStartBackground}
        onComplete={vi.fn()}
        onSkip={vi.fn()}
      />
    )

    // Recommended summary is visible up front.
    expect(screen.getByText(/MP4/i)).toBeInTheDocument()
    expect(screen.getByText(/Balanced quality/i)).toBeInTheDocument()

    // Advanced controls are not shown until the disclosure is opened.
    expect(screen.queryByText('Output format')).not.toBeInTheDocument()
    expect(screen.queryByText('Quality preset')).not.toBeInTheDocument()

    // The primary action is reachable immediately.
    fireEvent.click(screen.getByRole('button', { name: /optimise & upload/i }))
    expect(onStartBackground).toHaveBeenCalledOnce()
  })

  it('reveals format, resolution and quality controls behind Advanced video settings', () => {
    mockWaitingState()

    render(
      <BrowserTranscodeStep
        file={file}
        onStartBackground={vi.fn().mockResolvedValue(undefined)}
        onComplete={vi.fn()}
        onSkip={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /advanced video settings/i }))

    expect(screen.getByText('Output format')).toBeInTheDocument()
    expect(screen.getByText('Quality preset')).toBeInTheDocument()
    expect(screen.getByText('Resolutions')).toBeInTheDocument()
  })
})
