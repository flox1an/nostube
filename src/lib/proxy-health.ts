/**
 * Probe an imgproxy-compatible server for reachability.
 *
 * Strategy:
 * - GET `${baseUrl}/health` with `no-store` to bypass caches.
 * - Treat any successful HTTP response (2xx/3xx/4xx) as "host reachable" → up.
 *   - 4xx covers proxies that don't expose a health endpoint but still serve image requests.
 * - Treat 5xx, network errors, and timeouts as "down".
 *
 * The probe is intentionally cheap (HEAD-equivalent payload, short timeout) so we can
 * run it on app boot, on window focus, and on a 60s interval without burdening anyone.
 */

/** Default probe timeout. Long enough for a transcontinental request, short enough not to stall UI. */
export const PROBE_TIMEOUT_MS = 3_000

export interface ProbeResult {
  reachable: boolean
  status?: number
  /** Why the probe concluded `reachable: false`. Useful for logs. */
  reason?: 'network' | 'timeout' | 'server-error' | 'empty-base'
  durationMs: number
}

export async function probeProxy(
  baseUrl: string | undefined,
  options: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<ProbeResult> {
  const started = Date.now()
  if (!baseUrl) {
    return { reachable: false, reason: 'empty-base', durationMs: 0 }
  }

  const cleanBase = baseUrl.replace(/\/+$/, '')
  const url = `${cleanBase}/health`
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS

  const controller = new AbortController()
  const onAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      // Don't send credentials — pure reachability check.
      credentials: 'omit',
      mode: 'cors',
    })
    const durationMs = Date.now() - started
    if (res.status >= 500) {
      return { reachable: false, status: res.status, reason: 'server-error', durationMs }
    }
    return { reachable: true, status: res.status, durationMs }
  } catch (err) {
    const durationMs = Date.now() - started
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Distinguish our timeout from upstream cancellation.
      const reason = options.signal?.aborted ? 'network' : 'timeout'
      return { reachable: false, reason, durationMs }
    }
    return { reachable: false, reason: 'network', durationMs }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
  }
}
