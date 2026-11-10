import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { TooltipProvider } from '../components/tooltip'
import { ControlBar } from './ControlBar'

vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../hooks/useProfile', () => ({ useProfile: () => undefined }))

it('hides the live timeline while keeping playback controls and restores seeking for recordings', () => {
  const onPlay = vi.fn()
  const onSeek = vi.fn()
  const props = {
    isVisible: true,
    isPlaying: false,
    currentTime: 30,
    duration: 120,
    bufferedPercentage: 70,
    onPlay,
    onPause: vi.fn(),
    onSeek,
    volume: 1,
    isMuted: false,
    onVolumeChange: vi.fn(),
    onToggleMute: vi.fn(),
    playbackRate: 1,
    onPlaybackRateChange: vi.fn(),
    hasCaptions: false,
    captionsEnabled: false,
    onToggleCaptions: vi.fn(),
    isPipSupported: false,
    onTogglePip: vi.fn(),
    cinemaMode: false,
    isFullscreen: false,
    onToggleFullscreen: vi.fn(),
    showTimelineMarkers: false,
  }
  const controls = (isLive: boolean) => (
    <TooltipProvider>
      <ControlBar {...props} isLive={isLive} />
    </TooltipProvider>
  )
  const { container, rerender } = render(controls(true))
  expect(screen.getByText('Live')).toBeInTheDocument()
  expect(container.querySelector('[style*="touch-action"]')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /play/i }))
  expect(onPlay).toHaveBeenCalledOnce()

  rerender(controls(false))
  expect(screen.queryByText('Live')).toBeNull()
  const timeline = container.querySelector<HTMLElement>('[style*="touch-action"]')!
  vi.spyOn(timeline, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 200 } as DOMRect)
  fireEvent.mouseDown(timeline, { clientX: 100 })
  expect(onSeek).toHaveBeenCalledWith(60)
})
