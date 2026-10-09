import type { CSSProperties } from 'react'

const DEFAULT_RATIO = 16 / 9
/** Odd values (a 1-pixel-wide video, a bad tag) must not make the box absurd. */
const MIN_RATIO = 0.4
const MAX_RATIO = 3

/** Width / height of a video from its `dimensions` tag (`1920x1080`), 16:9 when unknown. */
export function videoAspectRatio(dimensions: string | undefined): number {
  const match = dimensions?.match(/^(\d+)x(\d+)$/)
  if (!match) return DEFAULT_RATIO
  const ratio = Number(match[1]) / Number(match[2])
  return Number.isFinite(ratio) && ratio > 0
    ? Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio))
    : DEFAULT_RATIO
}

/**
 * The player's box: as wide as the page allows, but never taller than 80% of the window. The
 * width follows from the height limit (`80dvh * ratio`), so a vertical video becomes a narrow,
 * centred column instead of a screen-high one, and a wide video keeps its shape.
 */
export function playerBoxStyle(dimensions: string | undefined): CSSProperties {
  const ratio = videoAspectRatio(dimensions)
  return { aspectRatio: String(ratio), width: `min(100%, calc(80dvh * ${ratio}))` }
}
