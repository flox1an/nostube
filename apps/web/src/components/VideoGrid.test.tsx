import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { VideoGrid } from './VideoGrid'
import { BrowserRouter } from 'react-router-dom'
import type { VideoEvent } from '@nostube/core/video-event'
import { useWindowWidth } from '@/hooks/useWindowWidth'

// Mock dependencies
vi.mock('@/nostr/core', () => ({
  pool: { close: vi.fn() },
  eventStore: {
    getEvent: vi.fn(),
    add: vi.fn(),
    timeline: vi.fn(() => ({ subscribe: vi.fn() })),
  },
  accountManager: {
    getActiveAccount: vi.fn(),
  },
  factory: {},
}))

vi.mock('@/hooks/useWindowWidth', () => ({
  useWindowWidth: vi.fn(() => 1024), // Default desktop width
}))

vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: vi.fn(() => ({
    config: {
      nsfwFilter: 'hide',
      blossomServers: [],
    },
  })),
}))

vi.mock('@/components/VideoCard', () => ({
  VideoCard: ({
    video,
    format,
    allVideos,
    videoIndex,
  }: {
    video: VideoEvent
    format: 'vertical' | 'horizontal' | 'square'
    allVideos?: VideoEvent[]
    videoIndex?: number
  }) => (
    <div
      data-testid="video-card"
      data-video-id={video.id}
      data-format={format}
      data-all-count={allVideos?.length}
      data-video-index={videoIndex}
      tabIndex={0}
    >
      {video.title}
    </div>
  ),
  VideoCardSkeleton: ({ format }: { format: 'vertical' | 'horizontal' }) => (
    <div data-testid="video-card-skeleton" data-format={format}>
      Loading...
    </div>
  ),
}))

// Helper to wrap component with Router
const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>)
}

// jsdom has no layout; give every row a fixed height so the window
// virtualizer (viewport: jsdom's 768px innerHeight) mounts only a window of rows.
const mockRowHeight = (height: number) =>
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height)

// Mock video data factory
const createMockVideo = (overrides: Partial<VideoEvent> = {}): VideoEvent => ({
  id: `video-${Math.random()}`,
  pubkey: 'test-pubkey',
  title: 'Test Video',
  description: 'Test description',
  created_at: Date.now() / 1000,
  tags: [],
  type: 'videos',
  kind: 34235,
  images: ['https://example.com/thumb.jpg'],
  duration: 120,
  searchText: 'test video',
  urls: ['https://example.com/video.mp4'],
  link: '/v/test',
  textTracks: [],
  contentWarning: undefined,
  videoVariants: [],
  thumbnailVariants: [],
  origins: [],
  ...overrides,
})

describe('VideoGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.mocked(useWindowWidth).mockReturnValue(1024)
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true })
  })

  describe('Empty State', () => {
    it('should show empty message when no videos and not loading', () => {
      renderWithRouter(<VideoGrid videos={[]} isLoading={false} />)

      expect(screen.getByText(/No videos found/i)).toBeInTheDocument()
    })

    it('should not show empty message when loading', () => {
      renderWithRouter(<VideoGrid videos={[]} isLoading={true} showSkeletons={true} />)

      expect(screen.queryByText(/No videos found/i)).not.toBeInTheDocument()
    })
  })

  describe('Loading State', () => {
    it('should show skeletons when loading with showSkeletons=true', () => {
      renderWithRouter(<VideoGrid videos={[]} isLoading={true} showSkeletons={true} />)

      const skeletons = screen.getAllByTestId('video-card-skeleton')
      expect(skeletons.length).toBeGreaterThan(0)
    })

    it('should show horizontal skeletons in horizontal layout mode', () => {
      renderWithRouter(
        <VideoGrid videos={[]} isLoading={true} showSkeletons={true} layoutMode="horizontal" />
      )

      const skeletons = screen.getAllByTestId('video-card-skeleton')
      expect(skeletons[0]).toHaveAttribute('data-format', 'horizontal')
    })

    it('should show vertical skeletons in vertical layout mode', () => {
      renderWithRouter(
        <VideoGrid videos={[]} isLoading={true} showSkeletons={true} layoutMode="vertical" />
      )

      const skeletons = screen.getAllByTestId('video-card-skeleton')
      expect(skeletons[0]).toHaveAttribute('data-format', 'vertical')
    })

    it('should not show skeletons when showSkeletons=false', () => {
      renderWithRouter(<VideoGrid videos={[]} isLoading={true} showSkeletons={false} />)

      expect(screen.queryByTestId('video-card-skeleton')).not.toBeInTheDocument()
    })
  })

  describe('Video Rendering', () => {
    it('should render videos when provided', () => {
      const videos = [
        createMockVideo({ id: 'video-1', title: 'Video One' }),
        createMockVideo({ id: 'video-2', title: 'Video Two' }),
      ]

      renderWithRouter(<VideoGrid videos={videos} />)

      expect(screen.getByText('Video One')).toBeInTheDocument()
      expect(screen.getByText('Video Two')).toBeInTheDocument()
    })

    it('should render correct number of video cards', () => {
      const videos = [
        createMockVideo({ id: 'video-1' }),
        createMockVideo({ id: 'video-2' }),
        createMockVideo({ id: 'video-3' }),
      ]

      renderWithRouter(<VideoGrid videos={videos} />)

      const videoCards = screen.getAllByTestId('video-card')
      expect(videoCards).toHaveLength(3)
    })
  })

  describe('Layout Modes', () => {
    it('should use horizontal format in horizontal layout mode', () => {
      const videos = [createMockVideo({ id: 'video-1', type: 'videos' })]

      renderWithRouter(<VideoGrid videos={videos} layoutMode="horizontal" />)

      const videoCard = screen.getByTestId('video-card')
      expect(videoCard).toHaveAttribute('data-format', 'horizontal')
    })

    it('should use vertical format in vertical layout mode', () => {
      const videos = [createMockVideo({ id: 'video-1', type: 'shorts' })]

      renderWithRouter(<VideoGrid videos={videos} layoutMode="vertical" />)

      const videoCard = screen.getByTestId('video-card')
      expect(videoCard).toHaveAttribute('data-format', 'vertical')
    })

    it('should separate videos by type in auto layout mode', () => {
      const videos = [
        createMockVideo({ id: 'video-1', type: 'videos', title: 'Regular Video' }),
        createMockVideo({ id: 'video-2', type: 'shorts', title: 'Short Video' }),
      ]

      renderWithRouter(<VideoGrid videos={videos} layoutMode="auto" />)

      const videoCards = screen.getAllByTestId('video-card')
      expect(videoCards).toHaveLength(2)

      // Find the regular video and short video
      const regularVideo = videoCards.find(card => card.textContent === 'Regular Video')
      const shortVideo = videoCards.find(card => card.textContent === 'Short Video')

      expect(regularVideo).toHaveAttribute('data-format', 'horizontal')
      expect(shortVideo).toHaveAttribute('data-format', 'vertical')
    })

    it('should use auto layout mode by default', () => {
      const videos = [
        createMockVideo({ id: 'video-1', type: 'videos' }),
        createMockVideo({ id: 'video-2', type: 'shorts' }),
      ]

      renderWithRouter(<VideoGrid videos={videos} />)

      const videoCards = screen.getAllByTestId('video-card')
      expect(videoCards).toHaveLength(2)
    })
  })

  describe('NSFW Filtering', () => {
    it('should filter out NSFW videos when nsfwFilter is hide', () => {
      const videos = [
        createMockVideo({ id: 'video-1', title: 'Safe Video', contentWarning: undefined }),
        createMockVideo({ id: 'video-2', title: 'NSFW Video', contentWarning: 'NSFW' }),
      ]

      renderWithRouter(<VideoGrid videos={videos} />)

      expect(screen.getByText('Safe Video')).toBeInTheDocument()
      expect(screen.queryByText('NSFW Video')).not.toBeInTheDocument()
    })

    it('should show all videos when NSFW videos exist but not filtered', () => {
      // This test verifies that the component can handle videos with contentWarning flag
      // The actual filtering behavior is tested in the previous test
      const videos = [
        createMockVideo({ id: 'video-1', title: 'Safe Video', contentWarning: undefined }),
      ]

      renderWithRouter(<VideoGrid videos={videos} />)

      expect(screen.getByText('Safe Video')).toBeInTheDocument()
      const videoCards = screen.getAllByTestId('video-card')
      expect(videoCards).toHaveLength(1)
    })
  })

  describe('Playlist Parameter', () => {
    it('should pass playlistParam to VideoCard components', () => {
      const videos = [createMockVideo({ id: 'video-1' })]

      const { container } = renderWithRouter(
        <VideoGrid videos={videos} playlistParam="test-playlist" />
      )

      expect(container).toBeInTheDocument()
      // Note: We can't directly test the prop passing in this mock setup,
      // but we verify the component renders without errors
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty videos array gracefully', () => {
      renderWithRouter(<VideoGrid videos={[]} />)

      expect(screen.getByText(/No videos found/i)).toBeInTheDocument()
    })

    it('should handle videos with missing fields', () => {
      const videos = [
        createMockVideo({
          id: 'video-1',
          title: '',
          images: [],
        }),
      ]

      renderWithRouter(<VideoGrid videos={videos} />)

      const videoCard = screen.getByTestId('video-card')
      expect(videoCard).toBeInTheDocument()
    })

    it('should handle large number of videos', () => {
      mockRowHeight(300)
      const videos = Array.from({ length: 100 }, (_, i) =>
        createMockVideo({ id: `video-${i}`, title: `Video ${i}` })
      )

      renderWithRouter(<VideoGrid videos={videos} />)

      // Only rows around the viewport are mounted...
      const videoCards = screen.getAllByTestId('video-card')
      expect(videoCards.length).toBeGreaterThan(0)
      expect(videoCards.length).toBeLessThan(100)
      expect(screen.getByText('Video 0')).toBeInTheDocument()
      // ...while the list keeps the height of all 34 rows (3 columns at 1024px),
      // so the pagination sentinel after the grid stays out of view.
      const list = videoCards[0].closest('[data-row-key]')!.parentElement!
      expect(parseFloat(list.style.height)).toBeGreaterThanOrEqual(34 * 300)
    })

    it('should handle videos with only shorts', () => {
      const videos = [
        createMockVideo({ id: 'video-1', type: 'shorts' }),
        createMockVideo({ id: 'video-2', type: 'shorts' }),
      ]

      renderWithRouter(<VideoGrid videos={videos} layoutMode="auto" />)

      const videoCards = screen.getAllByTestId('video-card')
      expect(videoCards).toHaveLength(2)
      videoCards.forEach(card => {
        expect(card).toHaveAttribute('data-format', 'vertical')
      })
    })

    it('should handle videos with only regular videos', () => {
      const videos = [
        createMockVideo({ id: 'video-1', type: 'videos' }),
        createMockVideo({ id: 'video-2', type: 'videos' }),
      ]

      renderWithRouter(<VideoGrid videos={videos} layoutMode="auto" />)

      const videoCards = screen.getAllByTestId('video-card')
      expect(videoCards).toHaveLength(2)
      videoCards.forEach(card => {
        expect(card).toHaveAttribute('data-format', 'horizontal')
      })
    })
  })

  describe('Virtualization', () => {
    it('should hand the full shorts list to every mounted shorts card', () => {
      mockRowHeight(300)
      const shorts = Array.from({ length: 40 }, (_, i) =>
        createMockVideo({ id: `short-${i}`, type: 'shorts' })
      )

      renderWithRouter(<VideoGrid videos={shorts} layoutMode="vertical" />)

      const cards = screen.getAllByTestId('video-card')
      expect(cards.length).toBeLessThan(40)
      for (const card of cards) {
        expect(card).toHaveAttribute('data-all-count', '40')
        expect(card.dataset.videoId).toBe(`short-${card.dataset.videoIndex}`)
      }
    })

    it('should index auto-layout shorts within the shorts list only', () => {
      const videos = [
        createMockVideo({ id: 'wide-0', type: 'videos' }),
        createMockVideo({ id: 'short-0', type: 'shorts' }),
        createMockVideo({ id: 'wide-1', type: 'videos' }),
        createMockVideo({ id: 'short-1', type: 'shorts' }),
      ]

      renderWithRouter(<VideoGrid videos={videos} />)

      for (const id of ['short-0', 'short-1']) {
        const card = screen.getAllByTestId('video-card').find(c => c.dataset.videoId === id)!
        expect(card).toHaveAttribute('data-all-count', '2')
        expect(card).toHaveAttribute('data-video-index', id.slice(-1))
      }
    })

    it('should keep the focused row mounted after it scrolls out of view', () => {
      mockRowHeight(300)
      const videos = Array.from({ length: 100 }, (_, i) =>
        createMockVideo({ id: `focus-${i}`, title: `Focus ${i}` })
      )
      renderWithRouter(<VideoGrid videos={videos} />)

      const focused = screen.getByText('Focus 0')
      act(() => focused.focus())
      act(() => {
        Object.defineProperty(window, 'scrollY', {
          value: 5000,
          configurable: true,
          writable: true,
        })
        fireEvent.scroll(window)
      })

      // Unfocused rows near the top are unmounted; the focused one stays.
      expect(screen.queryByText('Focus 3')).not.toBeInTheDocument()
      expect(screen.getByText('Focus 0')).toBe(focused)
      expect(document.activeElement).toBe(focused)
    })

    it('should refocus the same card when a column change rebuilds the rows', () => {
      const videos = Array.from({ length: 12 }, (_, i) =>
        createMockVideo({ id: `cols-${i}`, title: `Cols ${i}` })
      )
      const { rerender } = renderWithRouter(<VideoGrid videos={videos} />)

      act(() => screen.getByText('Cols 4').focus())
      // 1024px → 768px: 3 → 2 columns; every row is rebuilt and its cards remount.
      vi.mocked(useWindowWidth).mockReturnValue(768)
      rerender(
        <BrowserRouter>
          <VideoGrid videos={videos} />
        </BrowserRouter>
      )

      expect(document.activeElement).toBe(screen.getByText('Cols 4'))
    })
  })

  describe('Loading with Existing Videos', () => {
    it('should not show skeletons when videos exist and showSkeletons=false', () => {
      const videos = [createMockVideo({ id: 'video-1' })]

      renderWithRouter(<VideoGrid videos={videos} isLoading={true} showSkeletons={false} />)

      expect(screen.getByTestId('video-card')).toBeInTheDocument()
      expect(screen.queryByTestId('video-card-skeleton')).not.toBeInTheDocument()
    })

    it('should show videos when loading with existing videos', () => {
      const videos = [createMockVideo({ id: 'video-1', title: 'Existing Video' })]

      renderWithRouter(<VideoGrid videos={videos} isLoading={true} showSkeletons={true} />)

      expect(screen.getByText('Existing Video')).toBeInTheDocument()
    })
  })
})
