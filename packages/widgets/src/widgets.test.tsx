import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VideoGrid } from './VideoGrid'
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
