import type { NostrEvent } from 'nostr-tools'
import type { BrandingSlot, InstanceSite, Reach } from '@nostube/core/instance-config'
import { forgetActiveAccount } from './accounts'
import i18n from './i18n'
import type { Signer } from './signer'

export type SearchConfig = { mode: 'off' } | { mode: 'local' }

/** Where the creator site is served: by this instance, or as a NIP-5A nsite (server ADR 0013). */
export type SiteHosting = 'instance' | 'nsite'

/**
 * S3-compatible storage (`config.storage.s3`). The secret is write-only: GET answers `secretSet`
 * instead; `secretAccessKey` is sent only to replace it (omitted keeps the stored one).
 */
export interface S3Config {
  endpoint: string
  bucket: string
  /** `auto` unless the provider (AWS) needs the bucket's region. */
  region: string
  /** Path-style addressing (MinIO, Garage) instead of bucket subdomains. */
  forcePathStyle: boolean
  accessKeyId: string
  /** Read-only: a secret is stored on the server. */
  secretSet: boolean
  secretAccessKey?: string
}

/** What the server lets the studio edit (`GET/PUT /api/admin/config`). */
export interface AdminConfig {
  title: string
  creators: string[]
  allowedWriters: string[]
  /** The lists below are kept as stored; in `private` the server sends only its own relay. */
  videoSources: string[]
  interactionRelays: string[]
  /** Visitor profile lookups and, in `public`, where the managed key's kind 0 and 10002 go. */
  profileRelays: string[]
  /** Where the outbox copies this instance's own events and blobs; both empty = off. */
  mirror: { relays: string[]; blossom: string[] }
  search: SearchConfig
  /** `s3`: null keeps every upload on this machine; once set the server refuses to turn it off. */
  storage: { quotaGib: number; freeSpaceReserveGib: number; s3: S3Config | null }
  /** `lightning`: the channel's Lightning address for zaps, `""` when unset (admin-only, not public).
   * `countPlays`: the server counts plays per video file and day (absent from older servers: off). */
  site: InstanceSite & { lightning?: string; countPlays?: boolean }
  /** `private`: publishes nothing, only mirror targets get copies; `public`: published into Nostr (ADR 0012). */
  reach: Reach
  /** `nsite` only with the managed key and in `public`; the server forces `instance` in `private`. */
  siteHosting: SiteHosting
  /** `gateway`: bare host the nsite URL `https://<npub>.<gateway>` uses; `domain`: optional CNAME. */
  nsite: { gateway: string; domain: string }
}

export interface AdminState {
  revision: number
  origin: string
  tls: string
  /** `local-ca`: the instance runs its own CA; `proxy`: TLS ends at a reverse proxy. */
  tlsMode: 'local-ca' | 'proxy'
  bootId: string
  nostrPubkey: string | null
  /** False when the origin is not publicly reachable (local CA, `.local` host, IP address). */
  originIsPublic: boolean
  /** The saved config may be public: a public origin, or public mirror relays and Blossom servers. */
  canBePublic: boolean
  config: AdminConfig
  /** The uploaded logo, favicon, banner and app icon (their URLs), null where none is set. */
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
  icon: { bytes: 2048 * 1024, size: '2 MB', types: ['image/png'] },
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
  // Only the app icon has a shape rule (square, at least 512×512).
  if (res.status === 422) throw new Error(i18n.t('studio.branding.errors.iconSize'))
  if (!res.ok) throw new Error(await errorMessage(res))
  const body: unknown = await res.json()
  if (body && typeof body === 'object' && 'url' in body && typeof body.url === 'string')
    return body.url
  throw new Error(i18n.t('studio.errors.serverStatus', { status: res.status }))
}

/** Activates an image already uploaded to this instance's Blossom, without sending it twice. */
export async function setBrandingBlob(slot: BrandingSlot, sha256: string): Promise<string> {
  const res = await fetch(`/api/admin/branding/${slot}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha256 }),
  })
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

/**
 * Validates, keeps the previous config and applies the new one: at once, or (`restart`) by
 * restarting the instance when writers, storage or mirrors change. `deleteNsite` answers "Delete
 * the nsite now?" when the save turns a published nsite off; the server wants it then.
 */
export async function saveConfig(
  config: AdminConfig,
  deleteNsite?: boolean
): Promise<{ revision: number; restart: boolean }> {
  const res = await fetch('/api/admin/config', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(deleteNsite === undefined ? config : { ...config, deleteNsite }),
  })
  if (!res.ok) throw new Error(await errorMessage(res))
  return (await res.json()) as { revision: number; restart: boolean }
}

/** The site as an nsite (`GET /api/admin/nsite`): the last published version and its delivery. */
export interface NsiteStatus {
  url: string | null
  /** The NIP-5A aggregate hash of the last published manifest. */
  aggregate: string | null
  /** Unix seconds. */
  publishedAt: number | null
  status: 'disabled' | 'pending' | 'published' | 'failed'
  error: string | null
  /** Turned off with "Keep copies": the last manifest and its files stay public. */
  retained: boolean
}

export async function loadNsite(): Promise<NsiteStatus> {
  const res = await fetch('/api/admin/nsite', { credentials: 'same-origin' })
  if (!res.ok) throw new Error(await errorMessage(res))
  return (await res.json()) as NsiteStatus
}

/** Has the server build and publish the nsite from the saved settings; its status follows. */
export async function publishNsite(): Promise<void> {
  const res = await fetch('/api/admin/nsite/publish', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) throw new Error(await errorMessage(res))
}

/** The connection test: Almond's probe (put, get, list, delete) or the step that failed. */
export type StorageTestResult = { ok: true } | { ok: false; step: string; error: string }

/** Probes the bucket with the form's values; an omitted secret means the stored one. */
export const testStorageConnection = (s3: S3Config) =>
  postJson<StorageTestResult>('/api/admin/storage/test', s3)

/** `GET /api/admin/storage`: whether the bucket answers, and the move of local files into it. */
export interface StorageStatus {
  /** Null while S3 is off. `lastAttempt`: unix seconds. */
  s3: null | { available: boolean; lastError: string | null; lastAttempt: number | null }
  move: {
    state: 'idle' | 'running' | 'completed' | 'failed'
    filesDone: number
    filesTotal: number
    bytesDone: number
    bytesTotal: number
    error: string | null
    /** Upload blobs still on this machine (the cache stays local and is not counted). */
    localFiles: number
    localBytes: number
  }
}

export async function loadStorageStatus(): Promise<StorageStatus> {
  const res = await fetch('/api/admin/storage', { credentials: 'same-origin' })
  if (!res.ok) throw new Error(await errorMessage(res))
  return (await res.json()) as StorageStatus
}

/** Starts (or resumes) moving local uploads into the bucket in the background. */
export async function startStorageMove(): Promise<void> {
  await postJson<unknown>('/api/admin/storage/move', {})
}

/**
 * S2 (the origin is not public, mirror Blossom servers are set): published events carry only
 * the mirrors' URLs, so publishing waits until a mirror holds every file (server ADR 0013).
 */
export const usesMirrorUrls = (state: AdminState) =>
  state.config.reach === 'public' && !state.originIsPublic

export interface MediaMirrorConfirmation {
  ready: boolean
  urls: Record<string, string>
  error: string | null
}

/** Requests confirmed public copies; missing blobs remain pending, never publication-ready. */
export async function confirmMediaMirrors(
  hashes: string[],
  signal?: AbortSignal
): Promise<MediaMirrorConfirmation> {
  const res = await fetch('/api/admin/media/mirrors', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hashes: [...new Set(hashes)] }),
    signal,
  })
  if (!res.ok) throw new Error(await errorMessage(res))
  return (await res.json()) as MediaMirrorConfirmation
}

/**
 * Waits until a mirror Blossom server confirmed every blob (`POST /api/admin/media/mirrors`) and
 * answers each hash's public URL. Throws the server's reason when a copy failed.
 */
export async function waitForMirrors(
  hashes: string[],
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
  { intervalMs = 3000 } = {}
): Promise<Record<string, string>> {
  hashes = [...new Set(hashes)]
  for (;;) {
    signal?.throwIfAborted()
    const { ready, urls, error } = await confirmMediaMirrors(hashes, signal)
    if (error) throw new Error(i18n.t('studio.errors.mirrorFailed', { reason: error }))
    const done = hashes.filter(hash => urls[hash]).length
    onProgress(done, hashes.length)
    signal?.throwIfAborted()
    // Every hash needs its URL: an instance URL left in the event would not load in S2.
    if (ready && done === hashes.length) return urls
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        signal?.removeEventListener('abort', abort)
        resolve()
      }
      const timer = setTimeout(finish, intervalMs)
      const abort = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        reject(signal?.reason)
      }
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
    })
  }
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

/**
 * Has the server create the managed key, or answers the one it holds already (a retried
 * onboarding); it is not a creator until the config says so.
 */
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

/** Plays per video event id in the last `days` (1–365), only videos played at least once. */
export async function loadPlays(days: number): Promise<Record<string, number>> {
  const res = await fetch(`/api/admin/plays?days=${days}`, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(await errorMessage(res))
  return (await res.json()) as Record<string, number>
}

/** What the outbox holds per target and kind (`GET /api/admin/outbox`). */
export interface OutboxStatus {
  relays: string[]
  blossom: string[]
  counts: {
    target: string
    kind: 'event' | 'blob' | 'cleanup' | 'blob-delete'
    pending: number
    done: number
    failed: number
  }[]
  /** Failed jobs and jobs waiting for a retry, newest first. */
  problems: {
    kind: 'event' | 'blob' | 'cleanup' | 'blob-delete'
    target: string
    ref: string
    status: 'pending' | 'failed'
    attempts: number
    lastError: string
    /** Unix seconds; only for `pending`. */
    nextAttemptAt: number | null
    updatedAt: number
  }[]
}

export async function loadOutbox(): Promise<OutboxStatus> {
  const res = await fetch('/api/admin/outbox', { credentials: 'same-origin' })
  if (!res.ok) throw new Error(await errorMessage(res))
  return (await res.json()) as OutboxStatus
}

/** Gives failed jobs (of one target, or all) a fresh set of attempts. Answers how many. */
export async function retryOutbox(target?: string): Promise<number> {
  return (await postJson<{ retried: number }>('/api/admin/outbox/retry', target ? { target } : {}))
    .retried
}

/** A video held by the server until its due date (`GET /api/admin/schedule`). */
export interface ScheduledVideo {
  id: string
  kind: number
  identifier: string
  /** Unix seconds. */
  dueAt: number
  state: 'scheduled' | 'released' | 'failed'
  /** Why a `failed` video was not released. */
  error: string | null
  releasedAt: number | null
  /** The signed event the server holds. */
  event: NostrEvent
}

export async function loadSchedule(): Promise<ScheduledVideo[]> {
  const res = await fetch('/api/admin/schedule', { credentials: 'same-origin' })
  if (!res.ok) throw new Error(await errorMessage(res))
  const body: { items: ScheduledVideo[] } = await res.json()
  return body.items
}

/** Hands a signed video event to the server, which publishes it on its `published_at`. */
export const scheduleVideo = (signed: object) =>
  postJson<{ id: string; dueAt: number }>('/api/admin/schedule', signed)

/** Drops a scheduled video and removes its files. */
export const cancelScheduled = (id: string) =>
  postJson<{ cancelled: true }>('/api/admin/schedule/cancel', { id })

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
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) return false
    try {
      // A unique query: a proxy that caches /api/health (a Cloudflare "cache everything" rule)
      // would otherwise keep answering the old boot id.
      const res = await fetch(`/api/health?t=${Date.now()}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(Math.min(5000, remainingMs)),
      })
      const body = (await res.json()) as { boot?: string }
      if (res.ok && body.boot && body.boot !== previousBootId) return true
    } catch {
      // the instance is down while it restarts
    }
  }
  return false
}

/** Logs in with the admin password (`POST /admin/login`, the form the server's own page sends). */
export async function logIn(password: string): Promise<void> {
  const res = await fetch('/admin/login', {
    method: 'POST',
    credentials: 'same-origin',
    body: new URLSearchParams({ password }),
  })
  // Success sets the session cookie and redirects to the studio; a wrong password answers the
  // login page again, a wait between tries 429 with `Retry-After`.
  if (res.redirected) return
  if (res.status === 429) {
    const seconds = Math.ceil(Number(res.headers.get('Retry-After')) || 1)
    throw new Error(i18n.t('studio.login.tooManyAttempts', { seconds }))
  }
  throw new Error(i18n.t('studio.login.wrongPassword'))
}

/** Binds (or logs in with) a Nostr key: the signer signs a NIP-98 event for `path`. */
export async function nostrPost(path: string, signer: Signer): Promise<void> {
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

/** Ends the session and the Nostr account in this browser; the studio then shows its login. */
export async function signOut(): Promise<void> {
  await logout()
  forgetActiveAccount()
  location.reload()
}
