import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VideoGrid } from './VideoGrid'
import { VideoPlayer } from './VideoPlayer'
import { formatDuration } from './format'
import { makeVideo } from './test-fixtures'

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(125)).toBe('2:05')
    expect(formatDuration(3725)).toBe('1:02:05')
    expect(formatDuration(-3)).toBe('0:00')
  })
})

describe('VideoGrid', () => {
  it('renders one card per video with title and duration', () => {
    render(
      <VideoGrid
        videos={[makeVideo({ id: '1', title: 'First' }), makeVideo({ id: '2', title: 'Second' })]}
      />
    )
    expect(screen.getByText('First')).toBeTruthy()
    expect(screen.getByText('Second')).toBeTruthy()
    expect(screen.getAllByText('2:05')).toHaveLength(2)
  })

  it('reports the selected video', () => {
    const onSelect = vi.fn()
    const video = makeVideo({ title: 'Pick me' })
    render(<VideoGrid videos={[video]} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalledWith(video)
  })

  it('shows the empty message when there are no videos', () => {
    render(<VideoGrid videos={[]} emptyMessage="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeTruthy()
  })
})

describe('VideoPlayer', () => {
  it('plays the first source and moves to the fallback on error', () => {
    const { container } = render(<VideoPlayer video={makeVideo()} />)
    const element = container.querySelector('video')!
    expect(element.getAttribute('src')).toBe('https://media.example/v.mp4')
    fireEvent.error(element)
    expect(element.getAttribute('src')).toBe('https://mirror.example/v.mp4')
  })

  it('asks Blossom servers for the hash when the declared URL fails', () => {
    const hash = 'a'.repeat(64)
    const video = makeVideo({
      x: hash,
      urls: [`https://dead.example/${hash}.mp4`],
      videoVariants: [
        { url: `https://dead.example/${hash}.mp4`, hash, mimeType: 'video/mp4', fallbackUrls: [] },
      ],
    })
    const { container } = render(
      <VideoPlayer
        video={video}
        blossomServers={[
          { url: 'https://blossom.example', name: 'blossom.example', tags: ['mirror'] },
        ]}
      />
    )
    const element = container.querySelector('video')!
    expect(element.getAttribute('src')).toBe(`https://dead.example/${hash}.mp4`)
    fireEvent.error(element)
    expect(element.getAttribute('src')).toMatch(/^https:\/\/blossom\.example\/a{64}\.mp4/)
  })

  it('reports that every source failed once the ladder is exhausted', () => {
    const { container } = render(<VideoPlayer video={makeVideo()} />)
    fireEvent.error(container.querySelector('video')!)
    fireEvent.error(container.querySelector('video')!)
    expect(screen.getByText(/every source failed/i)).toBeTruthy()
  })

  it('does not restart playback when the parent re-renders with the same video', () => {
    const assign = vi.fn()
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      configurable: true,
      get: () => '',
      set: assign,
    })
    try {
      const video = makeVideo()
      const { rerender } = render(<VideoPlayer video={video} />)
      rerender(<VideoPlayer video={video} />)
      rerender(<VideoPlayer video={{ ...video }} />)
      expect(assign).toHaveBeenCalledTimes(1)
    } finally {
      if (descriptor) Object.defineProperty(HTMLMediaElement.prototype, 'src', descriptor)
    }
  })

  it('says so when a video has no playable source', () => {
    render(<VideoPlayer video={makeVideo({ videoVariants: [], urls: [] })} />)
    expect(screen.getByText(/no playable source/i)).toBeTruthy()
  })
})
