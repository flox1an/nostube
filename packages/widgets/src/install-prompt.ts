/**
 * PWA install state: the deferred `beforeinstallprompt` event (Chromium), iOS detection
 * (no prompt there, only Share → "Add to Home Screen"), standalone mode, installation
 * and the install banner's visit count / dismissal.
 *
 * `startInstallPromptCapture()` runs in main.tsx before React mounts, because Chromium
 * may fire `beforeinstallprompt` before any component could listen for it.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallState {
  /** Visits counted so far, one per browser session. */
  visits: number
  dismissed: boolean
  installed: boolean
  standalone: boolean
  ios: boolean
  /** A deferred `beforeinstallprompt` event is waiting. */
  canPrompt: boolean
}

/** How the app can be installed here, or null when it can't (or already is). */
export type InstallMode = 'prompt' | 'ios' | null

export function getInstallMode(state: InstallState): InstallMode {
  if (state.installed || state.standalone) return null
  if (state.canPrompt) return 'prompt'
  if (state.ios) return 'ios'
  return null
}

export function shouldShowInstallBanner(state: InstallState): boolean {
  return state.visits >= 2 && !state.dismissed && getInstallMode(state) !== null
}

const VISITS_KEY = 'nostube_visit_count'
const VISIT_COUNTED_KEY = 'nostube_visit_counted'
const DISMISSED_KEY = 'nostube_install_hint_dismissed'
const INSTALLED_KEY = 'nostube_app_installed'

let deferredPrompt: BeforeInstallPromptEvent | null = null
let state: InstallState = {
  visits: 0,
  dismissed: false,
  installed: false,
  standalone: false,
  ios: false,
  canPrompt: false,
}
const listeners = new Set<() => void>()

function update(patch: Partial<InstallState>) {
  state = { ...state, ...patch }
  listeners.forEach(listener => listener())
}

export function subscribeInstallState(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getInstallState(): InstallState {
  return state
}

/** Counts this visit (once per session) and starts listening for install events. */
export function startInstallPromptCapture() {
  let visits = Number(localStorage.getItem(VISITS_KEY) ?? 0)
  if (!sessionStorage.getItem(VISIT_COUNTED_KEY)) {
    sessionStorage.setItem(VISIT_COUNTED_KEY, '1')
    visits += 1
    localStorage.setItem(VISITS_KEY, String(visits))
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault() // keep the mini-infobar away; we offer our own hint
    deferredPrompt = event as BeforeInstallPromptEvent
    update({ canPrompt: true })
  })
  window.addEventListener('appinstalled', () => {
    localStorage.setItem(INSTALLED_KEY, '1')
    deferredPrompt = null
    update({ installed: true, canPrompt: false })
  })

  update({
    visits,
    dismissed: localStorage.getItem(DISMISSED_KEY) === '1',
    // The site's manifest asks for fullscreen (Android honours it, iOS falls back to standalone).
    standalone:
      window.matchMedia?.('(display-mode: standalone), (display-mode: fullscreen)').matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    // iPadOS reports itself as a Mac; the touch points give it away.
    ios:
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1),
    installed: localStorage.getItem(INSTALLED_KEY) === '1',
  })
}

export function dismissInstallBanner() {
  localStorage.setItem(DISMISSED_KEY, '1')
  update({ dismissed: true })
}

/** Opens the native install dialog (Chromium). The event can only be used once. */
export async function promptInstall() {
  const event = deferredPrompt
  if (!event) return
  deferredPrompt = null
  update({ canPrompt: false })
  await event.prompt()
  // An accepted prompt also fires `appinstalled`; that listener records the installation.
}
