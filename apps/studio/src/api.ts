import type { InstanceSite } from '@nostube/core/instance-config'

export type SearchConfig = { mode: 'off' } | { mode: 'local' } | { mode: 'external'; url: string }

/** What the server lets the studio edit (`GET/PUT /api/admin/config`). */
export interface AdminConfig {
  title: string
  creators: string[]
  allowedWriters: string[]
  videoSources: string[]
  interactionRelays: string[]
  search: SearchConfig
  storage: { quotaGib: number; freeSpaceReserveGib: number }
  site: InstanceSite
}

export interface AdminState {
  revision: number
  origin: string
  tls: string
  /** `local-ca`: the instance runs its own CA; `proxy`: TLS ends at a reverse proxy. */
  tlsMode: 'local-ca' | 'proxy'
  bootId: string
  nostrPubkey: string | null
  config: AdminConfig
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    if (body.error) return body.error
  } catch {
    // not JSON
  }
  return `The server answered ${res.status}.`
}

/** `null` means the admin is not logged in. */
export async function loadAdmin(): Promise<AdminState | null> {
  const res = await fetch('/api/admin/config', { credentials: 'same-origin' })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(await errorMessage(res))
  return (await res.json()) as AdminState
}

/** Validates, keeps the previous config and restarts the instance on the new one. */
export async function saveConfig(config: AdminConfig): Promise<{ revision: number }> {
  const res = await fetch('/api/admin/config', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) throw new Error(await errorMessage(res))
  return (await res.json()) as { revision: number }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * After an apply the process stops and a supervisor starts it again. Polls `/api/health` for a
 * new boot id. The old process gives running uploads up to 30 s before it stops, so waits up to
 * 90 s; false when the server did not come back (nothing restarts it then).
 */
export async function waitForRestart(
  previousBootId: string,
  { intervalMs = 1000, timeoutMs = 90_000 } = {}
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(intervalMs)
    try {
      const res = await fetch('/api/health', { cache: 'no-store' })
      const body = (await res.json()) as { boot?: string }
      if (res.ok && body.boot && body.boot !== previousBootId) return true
    } catch {
      // the instance is down while it restarts
    }
  }
  return false
}

interface Nip07 {
  signEvent(event: object): Promise<object>
}
export const nip07 = (): Nip07 | undefined => (window as unknown as { nostr?: Nip07 }).nostr

/** Binds (or logs in with) the browser's NIP-07 key through a NIP-98 event for `path`. */
export async function nostrPost(path: string): Promise<void> {
  const signer = nip07()
  if (!signer) throw new Error('No NIP-07 signer found in this browser.')
  const event = await signer.signEvent({
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', location.origin + path],
      ['method', 'POST'],
    ],
    content: '',
  })
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Authorization: 'Nostr ' + btoa(JSON.stringify(event)) },
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function unbindNostr(): Promise<void> {
  const res = await fetch('/admin/unbind-nostr', { method: 'POST', credentials: 'same-origin' })
  if (!res.ok) throw new Error(await res.text())
}

export async function logout(): Promise<void> {
  await fetch('/admin/logout', { method: 'POST', credentials: 'same-origin', redirect: 'manual' })
}

/** Ends the session and leads to the login page. */
export async function signOut(): Promise<void> {
  await logout()
  location.href = '/admin/login'
}
