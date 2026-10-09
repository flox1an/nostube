import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { bootSite } from './boot'
import './i18n'
import './index.css'

// Follow the system colour scheme (the shared theme tokens switch on a `dark` class).
document.documentElement.classList.toggle(
  'dark',
  window.matchMedia('(prefers-color-scheme: dark)').matches
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App boot={bootSite()} />
  </StrictMode>
)
