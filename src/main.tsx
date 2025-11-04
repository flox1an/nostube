import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import './index.css'
import { checkAndClearCache } from './lib/cache-clear'

// Check if cache should be cleared before starting the app
checkAndClearCache().then(wasCleared => {
  if (wasCleared && import.meta.env.DEV) {
    console.log('Cache was cleared, app will now initialize with fresh cache')
  }

  createRoot(document.getElementById('root')!).render(<App />)
})
