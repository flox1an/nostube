import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSeekEvents } from './use-seek-events'

const seek = (detail: unknown) =>
  window.dispatchEvent(new CustomEvent('nostube:seek-to', { detail }))

describe('useSeekEvents', () => {
  it('moves the media element when a timestamp asks for it', () => {
    const element = { currentTime: 0 } as HTMLMediaElement
    renderHook(() => useSeekEvents(element))
    seek({ time: 83 })
    expect(element.currentTime).toBe(83)
  })

  it('ignores events without a usable time', () => {
    const element = { currentTime: 5 } as HTMLMediaElement
    renderHook(() => useSeekEvents(element))
    seek({})
    seek({ time: Number.NaN })
    seek({ time: '12' })
    expect(element.currentTime).toBe(5)
  })

  it('stops listening when the page goes away', () => {
    const element = { currentTime: 0 } as HTMLMediaElement
    const { unmount } = renderHook(() => useSeekEvents(element))
    unmount()
    seek({ time: 40 })
    expect(element.currentTime).toBe(0)
  })
})
