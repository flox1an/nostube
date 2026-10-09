import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { bootSite } from './boot'
import { followSystemColorScheme } from './theme'
import './i18n'
import './index.css'

// Follow the system colour scheme (the shared theme tokens switch on a `dark` class).
followSystemColorScheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App boot={bootSite()} />
  </StrictMode>
)
