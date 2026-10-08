/**
 * Full-screen height for layouts that must reach the bottom edge (shorts).
 *
 * In an installed iOS PWA (standalone), WebKit reports the viewport too short: the
 * bottom safe area is subtracted, and `100vh`, `100dvh`, `100%` and `innerHeight` all
 * return that value, leaving a bar above the home indicator. Standalone has no browser
 * chrome, so the screen height is the truth there. The safe-area values are not ready
 * on a cold start either, so the height is re-measured in steps instead of once.
 *
 * Only iOS: `navigator.standalone` exists only there. Android reports the height
 * correctly, and its `screen.height` includes the system bars (would overshoot).
 *
 * Ported from Tabubu (`fitViewport` in app.js). The result lands in `--app-height`.
 */

interface ViewportSource {
  innerWidth: number
  innerHeight: number
  visualViewportHeight?: number
  screenWidth: number
  screenHeight: number
  standalone?: boolean
}

/** Small differences are rounding, not the iOS bug (which is ~20–60px). */
const IOS_STANDALONE_THRESHOLD_PX = 15

export function measureAppHeight(source: ViewportSource): number {
  const portrait = source.innerHeight > source.innerWidth
  let height = source.visualViewportHeight ?? source.innerHeight

  if (source.standalone === true && portrait) {
    const screenHeight = Math.max(source.screenHeight, source.screenWidth)
    if (screenHeight - height > IOS_STANDALONE_THRESHOLD_PX) height = screenHeight
  }

  return Math.round(height)
}

let appHeight: number | undefined

/** Last measured full-screen height, for JS offsets (swipe distances). */
export function getAppHeight(): number {
  return appHeight ?? window.innerHeight
}

function fitAppHeight() {
  appHeight = measureAppHeight({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    visualViewportHeight: window.visualViewport?.height,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone,
  })
  document.documentElement.style.setProperty('--app-height', `${appHeight}px`)
}

export function installAppHeight() {
  window.addEventListener('resize', fitAppHeight)
  window.visualViewport?.addEventListener('resize', fitAppHeight)
  window.addEventListener('orientationchange', () => {
    setTimeout(fitAppHeight, 100)
    setTimeout(fitAppHeight, 300)
  })
  // iOS discards backgrounded PWAs and restores them; measure again on return.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) setTimeout(fitAppHeight, 50)
  })
  fitAppHeight()
  for (const delay of [50, 150, 300, 500, 800, 1200]) setTimeout(fitAppHeight, delay)
}
