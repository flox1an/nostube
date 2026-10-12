import { describe, expect, it } from 'vitest'
import { cropRect } from './image-crop'

describe('cropRect', () => {
  it('keeps square and wide crops inside portrait and landscape originals at every edge and zoom', () => {
    for (const [width, height] of [
      [4000, 3000],
      [2000, 4000],
    ]) {
      for (const aspect of [1, 3]) {
        for (const zoom of [1, 2, 4]) {
          for (const x of [0, 0.5, 1]) {
            for (const y of [0, 0.5, 1]) {
              const crop = cropRect(width, height, aspect, zoom, { x, y })
              expect(crop.width / crop.height).toBeCloseTo(aspect)
              expect(crop.x).toBeGreaterThanOrEqual(0)
              expect(crop.y).toBeGreaterThanOrEqual(0)
              expect(crop.x + crop.width).toBeLessThanOrEqual(width)
              expect(crop.y + crop.height).toBeLessThanOrEqual(height)
              if (x === 1) expect(crop.x + crop.width).toBeCloseTo(width)
              if (y === 1) expect(crop.y + crop.height).toBeCloseTo(height)
            }
          }
        }
      }
    }
    expect(cropRect(4000, 2000, 1, 2, { x: 0.5, y: 0.5 })).toEqual({
      x: 1500,
      y: 500,
      width: 1000,
      height: 1000,
    })
  })
})
