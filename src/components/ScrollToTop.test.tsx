import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { ScrollToTop } from './ScrollToTop'

function ListPage() {
  const navigate = useNavigate()
  return (
    <div>
      <span>list</span>
      <button onClick={() => navigate('/video')}>open video</button>
    </div>
  )
}

function VideoPage() {
  const navigate = useNavigate()
  return (
    <div>
      <span>video</span>
      <button onClick={() => navigate(-1)}>back</button>
    </div>
  )
}

function App() {
  return (
    <MemoryRouter initialEntries={['/list']}>
      <ScrollToTop />
      <Routes>
        <Route path="/list" element={<ListPage />} />
        <Route path="/video" element={<VideoPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('ScrollToTop', () => {
  it('restores the prior scroll position when navigating back, unlike a fresh push', () => {
    const scrollToSpy = vi.mocked(window.scrollTo)
    scrollToSpy.mockClear()

    render(<App />)
    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 0)

    // Simulate the user having scrolled down the list before opening a video.
    Object.defineProperty(window, 'scrollY', { value: 340, configurable: true })
    fireEvent.click(screen.getByText('open video'))
    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 0) // fresh push always starts at top

    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    fireEvent.click(screen.getByText('back'))

    expect(screen.getByText('list')).toBeInTheDocument()
    expect(scrollToSpy).toHaveBeenLastCalledWith(0, 340)
  })
})
