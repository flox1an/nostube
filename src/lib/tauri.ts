/**
 * Tauri-specific utilities for desktop app functionality
 */

/**
 * Check if the app is running inside Tauri
 */
export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window
}

/**
 * Get the Tauri window API dynamically (only available in Tauri context)
 */
async function getTauriWindow() {
  if (!isTauri()) return null
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    return getCurrentWindow()
  } catch {
    return null
  }
}

/**
 * Check if the Tauri window is currently fullscreen
 */
export async function isTauriFullscreen(): Promise<boolean> {
  const window = await getTauriWindow()
  if (!window) return false
  return window.isFullscreen()
}

/**
 * Enter fullscreen mode in Tauri
 */
export async function enterTauriFullscreen(): Promise<boolean> {
  const window = await getTauriWindow()
  if (!window) return false
  await window.setFullscreen(true)
  return true
}

/**
 * Exit fullscreen mode in Tauri
 */
export async function exitTauriFullscreen(): Promise<boolean> {
  const window = await getTauriWindow()
  if (!window) return false
  await window.setFullscreen(false)
  return true
}

/**
 * Toggle fullscreen mode in Tauri
 */
export async function toggleTauriFullscreen(): Promise<boolean> {
  const window = await getTauriWindow()
  if (!window) return false
  const isFullscreen = await window.isFullscreen()
  await window.setFullscreen(!isFullscreen)
  return true
}
