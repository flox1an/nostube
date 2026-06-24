import { useEffect } from 'react'
import { useAppContext } from '@/hooks/useAppContext'
import { probeProxy } from '@/lib/proxy-health'
import { useProxyHealthStore } from '@/stores/proxyHealthStore'

/** Re-probe the proxy every PROBE_INTERVAL_MS, in addition to on-focus probes. */
export const PROBE_INTERVAL_MS = 60_000

/**
 * Bootstraps and maintains the imgproxy health probe. Mount exactly once near the root.
 *
 * Behaviour:
 * - Probes immediately on mount and whenever `thumbResizeServerUrl` changes.
 * - Re-probes every {@link PROBE_INTERVAL_MS} so a downed proxy can recover automatically.
 * - Re-probes on `window.focus` to catch the case where a user returns to a tab after sleep.
 *
 * The probe writes to {@link useProxyHealthStore}; UI components subscribe via
 * {@link useImageProxy} and re-render with raw URLs when `status` flips to `'down'`.
 */
export function useProxyHealthMonitor(): void {
  const { config } = useAppContext()
  const base = config.thumbResizeServerUrl
  const markUp = useProxyHealthStore(s => s.markUp)
  const markDown = useProxyHealthStore(s => s.markDown)
  const markProbed = useProxyHealthStore(s => s.markProbed)

  useEffect(() => {
    if (!base) {
      // No proxy configured → behave as if it were down so callers serve raw URLs directly.
      markDown()
      return
    }

    let cancelled = false
    const controller = new AbortController()

    const runProbe = async () => {
      const result = await probeProxy(base, { signal: controller.signal })
      if (cancelled) return
      if (result.reachable) {
        markUp()
      } else {
        if (import.meta.env.DEV) {
          console.warn(
            `[proxy-health] probe failed (${result.reason ?? 'unknown'}) in ${result.durationMs}ms — bypassing proxy`
          )
        }
        markDown()
      }
      markProbed()
    }

    void runProbe()
    const interval = window.setInterval(runProbe, PROBE_INTERVAL_MS)
    const onFocus = () => void runProbe()
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      controller.abort()
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [base, markUp, markDown, markProbed])
}
