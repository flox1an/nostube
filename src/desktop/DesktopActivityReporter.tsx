import { invoke, isTauri } from '@tauri-apps/api/core'
import { useEffect } from 'react'

const REPORT_INTERVAL_MS = 15_000

export function DesktopActivityReporter() {
  useEffect(() => {
    if (!isTauri()) return

    let lastReport = 0
    const report = () => {
      const now = Date.now()
      if (now - lastReport < REPORT_INTERVAL_MS) return
      lastReport = now
      void invoke('desktop_record_activity')
    }

    report()
    window.addEventListener('keydown', report)
    window.addEventListener('pointerdown', report)
    window.addEventListener('pointermove', report, { passive: true })
    return () => {
      window.removeEventListener('keydown', report)
      window.removeEventListener('pointerdown', report)
      window.removeEventListener('pointermove', report)
    }
  }, [])

  return null
}
