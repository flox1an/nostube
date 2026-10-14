import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import './index.css'
import { checkAndClearCache } from './lib/cache-clear'
import { migrateLocalStoragePlayPositions } from './lib/play-position-storage'
import { installAppHeight } from './lib/app-height'
import { requestPersistentStorage } from './lib/persistent-storage'
import { startInstallPromptCapture } from '@nostube/widgets/install-prompt'
import { reloadForStaleChunk } from './lib/active-work'
import './i18n/config' // Initialize i18n

// iOS PWA full-screen height (--app-height), see lib/app-height.ts
installAppHeight()

// Before React mounts: Chromium can fire beforeinstallprompt early (@nostube/widgets/install-prompt)
startInstallPromptCapture()

// Installed app only: ask the browser not to evict play positions, outbox and drafts
void requestPersistentStorage()

// A deploy replaced the JS chunks this page references: reload (deferred during uploads),
// see lib/active-work.ts
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
