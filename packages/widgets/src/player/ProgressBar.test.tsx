import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProgressBar } from './ProgressBar'

vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }))

describe('live progress', () => {
  it('stays at the live edge as segments arrive and seeks within the DVR window', () => {
    const onSeek = vi.fn()
    const props = {
      isLive: true,
      currentTime: 94,
      duration: 100,
      seekableStart: 20,
      liveEnd: 96,
      liveEdgeTolerance: 4,
      bufferedPercentage: 100,
      onSeek,
      showTimelineMarkers: false,
    }
    const { container, rerender } = render(<ProgressBar {...props} />)
    const bar = container.firstElementChild as HTMLElement
    const progress = container.querySelector('.bg-primary.rounded-full') as HTMLElement
    expect(progress.style.width).toBe('100%')
    rerender(<ProgressBar {...props} currentTime={96} duration={104} liveEnd={100} />)
    expect(progress.style.width).toBe('100%')
    rerender(<ProgressBar {...props} currentTime={60} />)
    expect(parseFloat(progress.style.width)).toBeCloseTo((40 / 76) * 100)
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 200 } as DOMRect)
    fireEvent.mouseDown(bar, { clientX: 100 })
    expect(onSeek).toHaveBeenCalledWith(58)
  })
})
