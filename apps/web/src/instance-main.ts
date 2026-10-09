/**
 * Entry point of the instance build (vite.config.ts swaps it in for `src/main.tsx`).
 *
 * Loads `/api/config` before any app module is evaluated, so the relay pool, the event
 * loaders and the relay constants are built from the instance config and never from the
 * app defaults (nostube-server ADR 0005).
 */
import {
  decideLoad,
  LAST_GOOD_CONFIG_KEY,
  parseInstanceConfig,
  setInstanceConfig,
  type ConfigResponse,
  type InstanceConfig,
} from '@nostube/core/instance-config'

async function fetchConfig(): Promise<ConfigResponse> {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' })
    if (res.status !== 200) return { kind: 'http', status: res.status }
    return { kind: 'http', status: 200, body: await res.json().catch(() => undefined) }
  } catch {
    return { kind: 'network-error' }
  }
}

function readLastGood(): InstanceConfig | null {
  try {
    const parsed = parseInstanceConfig(
      JSON.parse(localStorage.getItem(LAST_GOOD_CONFIG_KEY) ?? 'null')
    )
    return parsed.ok ? parsed.config : null
  } catch {
    return null
  }
}

/** Plain DOM: the app (and its stylesheet) is not loaded when this shows. */
function showScreen(title: string, reason: string, button: string) {
  const root = document.getElementById('root')!
  root.style.cssText =
    'min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font-family:system-ui,sans-serif;padding:24px;text-align:center'
  const h1 = document.createElement('h1')
  h1.textContent = title
  h1.style.fontSize = '1.25rem'
  const p = document.createElement('p')
  p.textContent = reason
  p.style.opacity = '0.7'
  const btn = document.createElement('button')
  btn.textContent = button
  btn.style.cssText =
    'padding:8px 16px;border:1px solid currentColor;border-radius:6px;background:none;color:inherit;cursor:pointer'
  btn.onclick = () => location.reload()
  root.replaceChildren(h1, p, btn)
}

/** A different applied revision reloads the page, which rebuilds every loader from the new scope. */
async function recheckRevision(revision: number) {
  const res = await fetchConfig()
  if (res.kind !== 'http' || res.status !== 200) return
  const parsed = parseInstanceConfig(res.body)
  if (parsed.ok && parsed.config.revision !== revision) location.reload()
}

async function boot() {
  const decision = decideLoad(await fetchConfig(), readLastGood())
  if (decision.mode === 'retry') return showScreen('Instance unreachable', decision.reason, 'Retry')
  if (decision.mode === 'error')
    return showScreen('This instance cannot start', decision.reason, 'Reload')

  const { config } = decision
  if (!decision.stale) localStorage.setItem(LAST_GOOD_CONFIG_KEY, JSON.stringify(config))
  setInstanceConfig(config)
  document.title = config.title

  // Dynamic on purpose: app modules build the relay pool, loaders and relay constants at
  // evaluation time, so they must not be evaluated before setInstanceConfig().
  await import('./main.tsx')

  const recheck = () => void recheckRevision(config.revision)
  window.addEventListener('focus', recheck)
  // Relay reconnect: a relay that was up, dropped and is up again. (Dynamic for the same
  // evaluation-order reason; the module is already loaded by main.tsx at this point.)
  const { relayPool } = await import('./nostr/core')
  const wasUp = new Map<string, boolean>()
  relayPool.status$.subscribe(statuses => {
    for (const { url, connected } of Object.values(statuses)) {
      const prev = wasUp.get(url)
      if (connected) {
        if (prev === false) recheck()
        wasUp.set(url, true)
      } else if (prev) {
        wasUp.set(url, false)
      }
    }
  })
}

void boot()
