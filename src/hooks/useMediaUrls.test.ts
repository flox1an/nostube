import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useMediaUrls } from './useMediaUrls'

vi.mock('@/lib/media-url-generator', () => ({
  generateMediaUrls: vi.fn(({ urls }) => ({
    urls,
    metadata: urls.map(() => ({ source: 'original' })),
  })),
}))

vi.mock('@/lib/url-discovery', () => ({
  discoverUrlsWithCache: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/url-validator', () => ({
  validateMediaUrl: vi.fn().mockResolvedValue(true),
}))

describe('useMediaUrls', () => {
  it('resets the active URL when switching to a different video source', async () => {
    const { result, rerender } = renderHook(
      ({ urls, sha256 }: { urls: string[]; sha256: string }) =>
        useMediaUrls({
          urls,
          mediaType: 'video',
          sha256,
          discoveryEnabled: false,
        }),
      {
        initialProps: {
          urls: ['https://cdn.example/720p.mp4'],
          sha256: 'hash-720p',
        },
      }
    )

    await waitFor(() => {
      expect(result.current.currentUrl).toBe('https://cdn.example/720p.mp4')
    })

    rerender({
      urls: ['https://cdn.example/2160p.mp4'],
      sha256: 'hash-2160p',
    })

    await waitFor(() => {
      expect(result.current.currentIndex).toBe(0)
      expect(result.current.currentUrl).toBe('https://cdn.example/2160p.mp4')
      expect(result.current.urls).toEqual(['https://cdn.example/2160p.mp4'])
    })
  })

  it('preserves failed URLs when the same video rerenders', async () => {
    const { result, rerender } = renderHook(
      ({ urls }: { urls: string[] }) =>
        useMediaUrls({
          urls,
          mediaType: 'video',
          discoveryEnabled: false,
        }),
      {
        initialProps: {
          urls: ['https://cdn.example/primary.mp4', 'https://cdn.example/fallback.mp4'],
        },
      }
    )

    await waitFor(() => {
      expect(result.current.currentUrl).toBe('https://cdn.example/primary.mp4')
    })

    result.current.moveToNext()
    rerender({
      urls: ['https://cdn.example/primary.mp4', 'https://cdn.example/fallback.mp4'],
    })

    expect(result.current.currentUrl).toBe('https://cdn.example/fallback.mp4')
  })
})
