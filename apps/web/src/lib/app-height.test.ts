import { describe, expect, it } from 'vitest'
import { measureAppHeight } from './app-height'

const iPhone = { innerWidth: 393, screenWidth: 393, screenHeight: 852 }

describe('measureAppHeight', () => {
  it('uses the full screen height in an iOS PWA whose viewport is reported too short', () => {
    expect(measureAppHeight({ ...iPhone, innerHeight: 818, standalone: true })).toBe(852)
  })

  it('keeps the viewport height in Safari (not standalone), where the toolbar takes space', () => {
    expect(measureAppHeight({ ...iPhone, innerHeight: 660, standalone: false })).toBe(660)
  })

  it('ignores rounding-sized differences in standalone', () => {
    expect(measureAppHeight({ ...iPhone, innerHeight: 845, standalone: true })).toBe(845)
  })

  it('does not correct landscape, where the screen height is the width', () => {
    expect(
      measureAppHeight({
        innerWidth: 852,
        innerHeight: 360,
        screenWidth: 393,
        screenHeight: 852,
        standalone: true,
      })
    ).toBe(360)
  })

  it('leaves Android alone, whose screen height includes the system bars', () => {
    expect(
      measureAppHeight({ innerWidth: 412, innerHeight: 780, screenWidth: 412, screenHeight: 915 })
    ).toBe(780)
  })

  it('prefers the visual viewport height when available', () => {
    expect(measureAppHeight({ ...iPhone, innerHeight: 700, visualViewportHeight: 690 })).toBe(690)
  })
})
