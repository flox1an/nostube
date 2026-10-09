import { describe, expect, it } from 'vitest'
import { playerBoxStyle, videoAspectRatio } from './player-box'

describe('videoAspectRatio', () => {
  it('reads the dimensions tag', () => {
    expect(videoAspectRatio('1920x1080')).toBeCloseTo(16 / 9)
    expect(videoAspectRatio('1080x1920')).toBeCloseTo(9 / 16)
  })

  it('falls back to 16:9 and keeps odd values in range', () => {
    expect(videoAspectRatio(undefined)).toBeCloseTo(16 / 9)
    expect(videoAspectRatio('nonsense')).toBeCloseTo(16 / 9)
    expect(videoAspectRatio('0x100')).toBeCloseTo(16 / 9)
    expect(videoAspectRatio('1x1000')).toBe(0.4)
    expect(videoAspectRatio('5000x100')).toBe(3)
  })
})

describe('playerBoxStyle', () => {
  it('limits the height to 80% of the window through the width', () => {
    const style = playerBoxStyle('1080x1920')
    expect(style.width).toBe('min(100%, calc(80dvh * 0.5625))')
    expect(style.aspectRatio).toBe('0.5625')
  })
})
