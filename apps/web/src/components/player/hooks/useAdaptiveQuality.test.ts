import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import { useAdaptiveQuality } from './useAdaptiveQuality'
import type { VideoVariant } from '@/utils/video-event'

const variants: VideoVariant[] = [
  {
    url: 'https://cdn.example/2160p.mp4',
    fallbackUrls: [],
    quality: '2160p',
  },
  {
    url: 'https://cdn.example/720p.mp4',
    fallbackUrls: [],
    quality: '720p',
  },
  {
    url: 'https://cdn.example/360p.mp4',
    fallbackUrls: [],
    quality: '360p',
  },
]

function useAdaptiveQualityHarness({
  video,
  selectedVariantIndex,
  onVariantChange,
}: {
  video: HTMLVideoElement
  selectedVariantIndex: number
  onVariantChange: (index: number) => void
}) {
  const videoRef = useRef<HTMLMediaElement | null>(video)

  useAdaptiveQuality({
    videoRef,
    videoVariants: variants,
    selectedVariantIndex,
    onVariantChange,
  })
}

describe('useAdaptiveQuality', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ignores buffering events briefly after a quality switch', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-10T12:00:00Z'))

    const video = document.createElement('video')
    const onVariantChange = vi.fn()

    const { rerender } = renderHook(useAdaptiveQualityHarness, {
      initialProps: {
        video,
        selectedVariantIndex: 1,
        onVariantChange,
      },
    })

    rerender({
      video,
      selectedVariantIndex: 0,
      onVariantChange,
    })

    act(() => {
      for (let i = 0; i < 3; i++) {
        video.dispatchEvent(new Event('waiting'))
        video.dispatchEvent(new Event('playing'))
      }
    })

    expect(onVariantChange).not.toHaveBeenCalled()
  })

  it('ignores buffering events briefly after seeking', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-10T12:00:00Z'))

    const video = document.createElement('video')
    const onVariantChange = vi.fn()

    renderHook(useAdaptiveQualityHarness, {
      initialProps: {
        video,
        selectedVariantIndex: 0,
        onVariantChange,
      },
    })

    act(() => {
      video.dispatchEvent(new Event('seeking'))
      vi.advanceTimersByTime(1000)
      video.dispatchEvent(new Event('seeked'))

      for (let i = 0; i < 3; i++) {
        video.dispatchEvent(new Event('waiting'))
        video.dispatchEvent(new Event('playing'))
      }
    })

    expect(onVariantChange).not.toHaveBeenCalled()
  })
})
