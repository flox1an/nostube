import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { VideoEvent } from '@nostube/core/video-event'
import { blurHashToDataURL } from '@nostube/core/blurhashDataURL'
import { VideoCard } from './VideoCard'

vi.mock('@nostube/widgets/hooks/useProfile', () => ({ useProfile: () => undefined }))
vi.mock('applesauce-react/hooks', () => ({
  useEventStore: () => ({ getEvent: () => undefined }),
}))
vi.mock('@/hooks', () => ({ useAppContext: () => ({ config: {} }) }))
vi.mock('@/desktop/useDesktopWindowCoordinator', () => ({
  useDesktopWindowCoordinator: () => undefined,
}))
vi.mock('./PlayProgressBar', () => ({ PlayProgressBar: () => null }))
vi.mock('./UserActionsMenu', () => ({ UserActionsMenu: () => null }))

const hash = 'LEHV6nWB2yk8pyo0adR*.7kCMdnj'
const video: VideoEvent = {
  id: 'a'.repeat(64),
  pubkey: 'b'.repeat(64),
  kind: 22,
  type: 'shorts',
  title: 'Slow thumbnail',
  description: '',
  created_at: 1700000000,
  images: ['https://example.com/thumbnail.jpg'],
  urls: ['https://example.com/video.mp4'],
  link: 'test',
  duration: 0,
  tags: [],
  searchText: '',
  textTracks: [],
  contentWarning: undefined,
  origins: [],
  thumbnailVariants: [{ url: 'https://example.com/thumbnail.jpg', fallbackUrls: [] }],
  videoVariants: [{ url: 'https://example.com/video.mp4', fallbackUrls: [], blurhash: hash }],
}

describe('VideoCard blurhash', () => {
  it.each(['vertical', 'horizontal'] as const)(
    'keeps the video blurhash behind a slow %s thumbnail through its fade-in',
    format => {
      const { container } = render(
        <MemoryRouter>
          <VideoCard video={video} format={format} hideAuthor />
        </MemoryRouter>
      )
      const placeholder = () => container.querySelector(`img[src="${blurHashToDataURL(hash)}"]`)
      const thumbnail = screen.getByAltText(video.title)
      expect(placeholder()).toBeInTheDocument()
      expect(thumbnail).toHaveClass('opacity-0')

      fireEvent.load(thumbnail)

      expect(thumbnail).not.toHaveClass('opacity-0')
      expect(placeholder()).toBeInTheDocument()
    }
  )
})
