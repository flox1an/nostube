import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  mockAllIsIntersecting,
  resetIntersectionMocking,
  setupIntersectionMocking,
} from 'react-intersection-observer/test-utils'
import { useInfiniteScroll } from './useInfiniteScroll'

beforeEach(() => setupIntersectionMocking(vi.fn))
afterEach(() => {
  cleanup()
  resetIntersectionMocking()
})

it('does not start another page while prefetching or after exhaustion', () => {
  const onLoadMore = vi.fn()
  const onPrefetch = vi.fn()
  const { result, rerender } = renderHook(
    ({ prefetching, exhausted }) =>
      useInfiniteScroll({ onLoadMore, onPrefetch, loading: false, prefetching, exhausted }),
    { initialProps: { prefetching: true, exhausted: false } }
  )
  const sentinel = document.createElement('div')
  act(() => {
    result.current.loadMoreRef(sentinel)
    result.current.prefetchRef(sentinel)
  })
  act(() => mockAllIsIntersecting(true))
  expect(onLoadMore).not.toHaveBeenCalled()
  expect(onPrefetch).not.toHaveBeenCalled()

  rerender({ prefetching: false, exhausted: true })
  expect(onLoadMore).not.toHaveBeenCalled()
  expect(onPrefetch).not.toHaveBeenCalled()

  rerender({ prefetching: false, exhausted: false })
  expect(onLoadMore).toHaveBeenCalledOnce()
  expect(onPrefetch).toHaveBeenCalledOnce()
})
