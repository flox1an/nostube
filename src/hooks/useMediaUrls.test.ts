import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useMediaUrls } from './useMediaUrls'

const { generateMediaUrls } = vi.hoisted(() => ({
  generateMediaUrls: vi.fn(({ urls }) => ({
    urls,
    metadata: urls.map(() => ({ source: 'original' })),
  })),
}))

vi.mock('@/lib/media-url-generator', () => ({
  generateMediaUrls,
}))

vi.mock('@/lib/url-discovery', () => ({
  discoverUrlsWithCache: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/url-validator', () => ({
  validateMediaUrl: vi.fn().mockResolvedValue(true),
}))

describe('useMediaUrls', () => {
  it('replaces the ladder when switching Video Events', async () => {
    const { result, rerender } = renderHook(
      ({ urls, sha256 }: { urls: string[]; sha256: string }) =>
        useMediaUrls({ urls, mediaType: 'video', sha256, discoveryEnabled: false }),
      {
        initialProps: {
          urls: ['https://cdn.example/720p.mp4', 'https://cdn.example/720p-fallback.mp4'],
          sha256: 'hash-720p',
        },
      }
    )

    const firstLadder = result.current.ladder
    firstLadder.tryNext()
    expect(firstLadder.currentUrl).toBe('https://cdn.example/720p-fallback.mp4')

    rerender({ urls: ['https://cdn.example/2160p.mp4'], sha256: 'hash-2160p' })

    await waitFor(() => {
      expect(result.current.ladder).not.toBe(firstLadder)
      expect(result.current.ladder.currentUrl).toBe('https://cdn.example/2160p.mp4')
    })
  })

  it('preserves failed URLs when the same Video Event rerenders', () => {
    const urls = ['https://cdn.example/primary.mp4', 'https://cdn.example/fallback.mp4']
    const { result, rerender } = renderHook(() =>
      useMediaUrls({ urls, mediaType: 'video', discoveryEnabled: false })
    )

    result.current.ladder.tryNext()
    rerender()

    expect(result.current.ladder.currentUrl).toBe('https://cdn.example/fallback.mp4')
  })

  it('exposes only the ladder, loading state, and recoverable error', () => {
    const { result } = renderHook(() =>
      useMediaUrls({
        urls: ['https://cdn.example/video.mp4'],
        mediaType: 'video',
        discoveryEnabled: false,
      })
    )

    expect(Object.keys(result.current).sort()).toEqual(['error', 'isLoading', 'ladder'])
  })

  it('returns a recoverable error when candidate generation fails', () => {
    generateMediaUrls.mockImplementationOnce(() => {
      throw new Error('bad media URL')
    })

    const { result } = renderHook(() =>
      useMediaUrls({
        urls: ['https://cdn.example/video.mp4'],
        mediaType: 'video',
        discoveryEnabled: false,
      })
    )

    expect(result.current.error).toEqual(new Error('bad media URL'))
    expect(result.current.ladder.currentUrl).toBeNull()
  })
})
