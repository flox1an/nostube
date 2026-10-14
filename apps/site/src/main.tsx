import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { bootSite } from './boot'
import { followSystemColorScheme } from '@nostube/widgets/site-theme'
import { startInstallPromptCapture } from '@nostube/widgets/install-prompt'
import './i18n'
import './index.css'

// Follow the system colour scheme (the shared theme tokens switch on a `dark` class).
followSystemColorScheme()

// Before React mounts: Chromium can fire beforeinstallprompt early.
startInstallPromptCapture()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App boot={bootSite()} />
  </StrictMode>
)
