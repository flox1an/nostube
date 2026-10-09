import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { followSystemColorScheme } from '@nostube/widgets/site-theme'
import { App } from './App'
import './i18n'
import './index.css'

followSystemColorScheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
