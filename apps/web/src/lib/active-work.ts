/**
 * Single source of truth for "an upload or in-browser transcode is running right now".
 *
 * Fed by the code paths every such job goes through: `uploadFileToMultipleServersChunked`
 * (all Blossom uploads), `startBrowserTranscodeUploadJob` (background transcode+upload),
 * and the in-page transcodes in `useVideoTranscode` / `useContributeVariant`. DVM
 * transcodes are not counted: they run remotely and the UploadManager resumes them after
 * a reload.
 *
 * While work runs: automatic reloads are deferred (#139) and a screen wake lock is held
 * so mobile screens don't turn off and suspend the tab (#145).
 */
import { toast } from 'sonner'
import i18n from 'i18next' // the instance src/i18n/config initialises; no init side effect here

let running = 0

export function hasActiveUploadWork(): boolean {
  return running > 0
}

/** Marks one job as running. Call the returned function once the job ends (any outcome). */
export function beginUploadWork(): () => void {
  running++
  if (running === 1) void syncWakeLock()
  let ended = false
  return () => {
    if (ended) return
    ended = true
    running--
    if (running === 0) void syncWakeLock()
  }
}

/**
 * Automatic reload (new build, changed instance config): reloads now, unless an upload or
 * transcode is running — its source file lives only in memory and would be lost. Then a
 * notice offers "Reload now" instead.
 *
 * Decision (#139): the notice stays until the user acts; there is no automatic reload once
 * the work ends, because after an upload the user is usually still editing or publishing
 * the video, and a reload would interrupt that too.
 */
export function reloadUnlessBusy(): void {
  if (!hasActiveUploadWork()) return window.location.reload()
  toast(i18n.t('upload.reloadDeferred'), {
    id: 'deferred-reload', // repeated triggers update the one notice
    duration: Infinity,
    action: { label: i18n.t('upload.reloadNow'), onClick: () => window.location.reload() },
  })
}

// A deploy replaced the JS chunks this page references: reload to pick up the new
// build. Rate-limited rather than once per session, so a later deploy in the same
// tab still recovers, while a genuinely broken chunk can't cause a reload loop.
const CHUNK_RELOAD_KEY = 'nostube_chunk_reload'
export function reloadForStaleChunk(message: string): void {
  if (
    !message.includes('Failed to fetch dynamically imported module') &&
    !message.includes('error loading dynamically imported module') &&
    !message.includes('Failed to load module script') &&
    !message.includes('the server responded with a MIME type of')
  ) {
    return
  }
  const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0)
  if (Date.now() - lastReload < 30_000) return
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  reloadUnlessBusy()
}

// --- Screen wake lock ---------------------------------------------------------------

let wakeLock: WakeLockSentinel | null = null
let requesting = false

/** Hold the lock while work runs and the page is visible; the browser drops it when hidden. */
async function syncWakeLock(): Promise<void> {
  if (!hasActiveUploadWork()) {
    const lock = wakeLock
    wakeLock = null
    await lock?.release().catch(() => {})
    return
  }
  if (document.visibilityState !== 'visible' || requesting) return
  if ((wakeLock && !wakeLock.released) || !('wakeLock' in navigator)) return
  requesting = true
  try {
    wakeLock = await navigator.wakeLock.request('screen')
  } catch {
    // Denied (battery saver, policy): the work continues without it.
    return
  } finally {
    requesting = false
  }
  // Work may have ended while the request was pending.
  void syncWakeLock()
}

document.addEventListener('visibilitychange', () => void syncWakeLock())
