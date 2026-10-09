import type { BrandingSlot, InstanceSite } from '@nostube/core/instance-config'
import i18n from './i18n'

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
  /** The uploaded logo, favicon and banner (their URLs), null where none is set. */
  branding: Record<BrandingSlot, string | null>
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']

/** What the server takes per branding slot (`apps/server/src/branding.rs`). */
export const BRANDING_LIMITS: Record<
  BrandingSlot,
  { bytes: number; size: string; types: string[] }
> = {
  logo: { bytes: 512 * 1024, size: '512 KB', types: IMAGE_TYPES },
  favicon: {
    bytes: 512 * 1024,
    size: '512 KB',
    types: [...IMAGE_TYPES, 'image/x-icon', 'image/vnd.microsoft.icon'],
  },
  banner: { bytes: 2048 * 1024, size: '2 MB', types: IMAGE_TYPES },
}

/** Why the server would refuse the file (checked here first), or null. */
export function brandingProblem(slot: BrandingSlot, file: File): string | null {
  const limit = BRANDING_LIMITS[slot]
  if (!limit.types.includes(file.type)) return i18n.t('studio.branding.errors.wrongType')
  if (file.size > limit.bytes) return i18n.t('studio.branding.errors.tooBig', { size: limit.size })
  return null
}

/** Replaces the slot's image; it shows on the site at once. Answers the new URL. */
export async function uploadBranding(slot: BrandingSlot, file: File): Promise<string> {
  const res = await fetch(`/api/admin/branding/${slot}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  // The server checks the bytes, not the name: a renamed file is refused here.
  if (res.status === 413)
    throw new Error(i18n.t('studio.branding.errors.tooBig', { size: BRANDING_LIMITS[slot].size }))
  if (res.status === 415) throw new Error(i18n.t('studio.branding.errors.wrongType'))
  if (!res.ok) throw new Error(await errorMessage(res))
  const body: unknown = await res.json()
  if (body && typeof body === 'object' && 'url' in body && typeof body.url === 'string')
    return body.url
  throw new Error(i18n.t('studio.errors.serverStatus', { status: res.status }))
}

export async function deleteBranding(slot: BrandingSlot): Promise<void> {
  const res = await fetch(`/api/admin/branding/${slot}`, {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(await errorMessage(res))
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    if (body.error) return body.error
  } catch {
    // not JSON
  }
  return i18n.t('studio.errors.serverStatus', { status: res.status })
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

/** A studio write the server only accepts as JSON (`POST`); answers the JSON reply. */
export async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await errorMessage(res))
  return (await res.json()) as T
}

/**
 * Where the creator's key lives (`/api/admin/signer`): `managed` on this server (with its
 * public key), `own` in the owner's signer (the instance has creators the server holds no key
 * of), `none` before onboarding.
 */
export interface SignerInfo {
  mode: 'none' | 'managed' | 'own'
  pubkey: string | null
}

export async function loadSigner(): Promise<SignerInfo> {
  const res = await fetch('/api/admin/signer', { credentials: 'same-origin' })
  if (!res.ok) throw new Error(await errorMessage(res))
  return (await res.json()) as SignerInfo
}

/** Has the server create the managed key (once); it is not a creator until the config says so. */
export const createManagedKey = () => postJson<SignerInfo>('/api/admin/signer', {})

/** The managed key as `nsec`; the server wants the admin password again. */
export async function exportNsec(password: string): Promise<string> {
  return (await postJson<{ nsec: string }>('/api/admin/signer/export', { password })).nsec
}

/** What the built-in relay and Blossom server hold (`GET /api/admin/stats`), read-only. */
export interface AdminStats {
  relay: {
    url: string
    /** Stored, unexpired events; the sum of `eventsByKind`. */
    totalEvents: number
    /** Ascending by kind. */
    eventsByKind: { kind: number; count: number }[]
    /** The SQLite database with its write-ahead log. */
    databaseBytes: number
  }
  blossom: {
    url: string
    files: number
    storageBytes: number
    /** 0: no quota. */
    quotaBytes: number
    freeDiskBytes: number
    freeSpaceReserveBytes: number
    /** Counters since the server process started. */
    uploads: number
    downloads: number
    servedBytes: number
  }
}

export async function loadStats(): Promise<AdminStats> {
  const res = await fetch('/api/admin/stats', { credentials: 'same-origin' })
  if (!res.ok) throw new Error(await errorMessage(res))
  return (await res.json()) as AdminStats
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
  if (!signer) throw new Error(i18n.t('studio.errors.noNip07'))
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
