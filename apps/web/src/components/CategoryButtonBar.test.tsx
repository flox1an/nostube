import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { CategoryButtonBar } from './CategoryButtonBar'

vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({ config: { relays: [] }, updateConfig: vi.fn() }),
}))

afterEach(() => vi.unstubAllGlobals())

it('fades hidden categories, reveals the final category, and updates when the list resizes', () => {
  const resizeCallbacks: (() => void)[] = []
  vi.stubGlobal(
    'ResizeObserver',
    class implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallbacks.push(() => callback([], this))
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )

  render(
    <MemoryRouter>
      <CategoryButtonBar selectedRelay={null} onRelayChange={vi.fn()} />
    </MemoryRouter>
  )
  const categories = screen.getByRole('button', { name: 'All' }).parentElement!.parentElement!
  Object.defineProperties(categories, {
    clientWidth: { configurable: true, value: 200, writable: true },
    scrollWidth: { configurable: true, value: 1000, writable: true },
    scrollLeft: { configurable: true, value: 0, writable: true },
  })
  const resize = () => {
    act(() => {
      for (const callback of resizeCallbacks) callback()
    })
  }
  resize()
  expect(categories.style.maskImage).toContain('transparent')

  // Browsers can leave a fractional remainder at the end of the list.
  categories.scrollLeft = 799.5
  fireEvent.scroll(categories)
  expect(categories.style.maskImage).toBe('')

  categories.scrollLeft = 400
  fireEvent.scroll(categories)
  expect(categories.style.maskImage).toContain('transparent')

  categories.scrollLeft = 0
  Object.defineProperty(categories, 'clientWidth', { value: 1200 })
  resize()
  expect(categories.style.maskImage).toBe('')

  Object.defineProperty(categories, 'clientWidth', { value: 200 })
  resize()
  expect(categories.style.maskImage).toContain('transparent')
})
