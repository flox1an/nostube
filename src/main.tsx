import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import './index.css'
import { checkAndClearCache } from './lib/cache-clear'
import { migrateLocalStoragePlayPositions } from './lib/play-position-storage'
import './i18n/config' // Initialize i18n

// Auto-reload on stale chunk errors (after deployment, old cached HTML references missing JS files)
window.addEventListener('error', (event: ErrorEvent) => {
  if (
    event.message?.includes('Failed to fetch dynamically imported module') ||
    event.message?.includes('Failed to load module script')
  ) {
    const reloadKey = 'nostube_chunk_reload'
    const lastReload = sessionStorage.getItem(reloadKey)
    // Only reload once per session to avoid infinite loops
    if (!lastReload) {
      sessionStorage.setItem(reloadKey, Date.now().toString())
      window.location.reload()
    }
  }
})

// Also catch unhandled promise rejections (dynamic import() returns promises)
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const message = event.reason?.message || String(event.reason)
  if (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('the server responded with a MIME type of')
  ) {
    const reloadKey = 'nostube_chunk_reload'
    const lastReload = sessionStorage.getItem(reloadKey)
    if (!lastReload) {
      sessionStorage.setItem(reloadKey, Date.now().toString())
      window.location.reload()
    }
  }
})

// Check if cache should be cleared before starting the app
checkAndClearCache().then(wasCleared => {
  if (wasCleared && import.meta.env.DEV) {
    console.log('Cache was cleared, app will now initialize with fresh cache')
  }

  // One-time migration of legacy localStorage play positions to IndexedDB
  void migrateLocalStoragePlayPositions()

  createRoot(document.getElementById('root')!).render(<App />)
})
