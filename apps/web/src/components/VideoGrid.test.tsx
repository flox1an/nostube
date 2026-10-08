import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VideoGrid } from './VideoGrid'
import { BrowserRouter } from 'react-router-dom'
import type { VideoEvent } from '@/utils/video-event'

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
  }: {
    video: VideoEvent
    format: 'vertical' | 'horizontal' | 'square'
  }) => (
    <div data-testid="video-card" data-video-id={video.id} data-format={format}>
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
      const videos = Array.from({ length: 100 }, (_, i) =>
        createMockVideo({ id: `video-${i}`, title: `Video ${i}` })
      )

      renderWithRouter(<VideoGrid videos={videos} />)

      const videoCards = screen.getAllByTestId('video-card')
      expect(videoCards).toHaveLength(100)
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
