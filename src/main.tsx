import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import './index.css'
import { checkAndClearCache } from './lib/cache-clear'
import { migrateLocalStoragePlayPositions } from './lib/play-position-storage'
import { installAppHeight } from './lib/app-height'
import './i18n/config' // Initialize i18n

// iOS PWA full-screen height (--app-height), see lib/app-height.ts
installAppHeight()

// A deploy replaced the JS chunks this page references: reload to pick up the new
// build. Rate-limited rather than once per session, so a later deploy in the same
// tab still recovers, while a genuinely broken chunk can't cause a reload loop.
const CHUNK_RELOAD_KEY = 'nostube_chunk_reload'
const reloadForStaleChunk = (message: string) => {
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
  window.location.reload()
}

window.addEventListener('error', (event: ErrorEvent) => reloadForStaleChunk(event.message ?? ''))
// Dynamic import() rejects instead of throwing
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) =>
  reloadForStaleChunk(event.reason?.message || String(event.reason))
)

// Check if cache should be cleared before starting the app
checkAndClearCache().then(wasCleared => {
  if (wasCleared && import.meta.env.DEV) {
    console.log('Cache was cleared, app will now initialize with fresh cache')
  }

  // One-time migration of legacy localStorage play positions to IndexedDB
  void migrateLocalStoragePlayPositions()

  createRoot(document.getElementById('root')!).render(<App />)
})
