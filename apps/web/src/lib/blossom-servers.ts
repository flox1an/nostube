/**
 * Blossom server information and utilities for onboarding
 */
import { DEFAULT_BLOSSOM_SERVERS, getInstanceConfig } from '@nostube/core/instance-config'
import type { BlossomServer } from '@nostube/core'
import { isBlossomServerBlocked } from '@nostube/core/blossom-url'
import { normalizeServerUrl } from '@nostube/core/blossom-utils'

export interface BlossomServerInfo {
  url: string
  name: string
  status: 'ok' | 'warning' | 'error' | 'todo'
  cdnProvider?: string
  supportsMirror: boolean
  maxFileSize?: string
  retention?: string
  payment: 'free' | 'paid' | 'freemium'
  price?: string
  notes?: string
}

/**
 * Recommended Blossom servers for onboarding
 * Excludes blocked servers (cdn.nostrcheck.me, nostr.download)
 */
export const RECOMMENDED_BLOSSOM_SERVERS: BlossomServerInfo[] = [
  {
    url: 'https://almond.slidestr.net',
    name: 'almond.slidestr.net',
    status: 'ok',
    supportsMirror: true,
    payment: 'free',
    notes: 'Supports chunked upload',
  },
  {
    url: 'https://blossom.primal.net',
    name: 'blossom.primal.net',
    status: 'ok',
    cdnProvider: 'Bunny Net',
    supportsMirror: false,
    payment: 'free',
  },
  {
    url: 'https://24242.io',
    name: '24242.io',
    status: 'ok',
    cdnProvider: 'Bunny Net',
    supportsMirror: false,
    maxFileSize: '100MB',
    retention: '60 days',
    payment: 'free',
  },
  {
    url: 'https://blossom.band',
    name: 'blossom.band',
    status: 'ok',
    cdnProvider: 'Cloudflare',
    supportsMirror: true,
    payment: 'paid',
    price: '$0.05/GB/Month',
    notes: 'Lightning payment',
  },
  {
    url: 'https://cdn.satellite.earth',
    name: 'cdn.satellite.earth',
    status: 'ok',
    cdnProvider: 'Cloudflare',
    supportsMirror: true,
    payment: 'paid',
    price: '$0.05/GB/Month',
    notes: 'Lightning payment',
  },
  {
    url: 'https://nostr.download',
    name: 'nostr.download',
    status: 'ok',
    supportsMirror: true,
    payment: 'free',
    notes: '',
  },
  {
    url: 'https://blossom-01.uid.ovh',
    name: 'blossom-01.uid.ovh',
    supportsMirror: true,
    status: 'ok',
    payment: 'free',
    notes: '',
  },
  {
    url: 'https://blossom-02.uid.ovh',
    name: 'blossom-02.uid.ovh',
    supportsMirror: true,

    status: 'ok',
    payment: 'free',
    notes: '',
  },
  {
    url: 'https://blossom.yakihonne.com',
    name: 'blossom.yakihonne.com',
    supportsMirror: true,
    status: 'ok',
    payment: 'free',
    notes: '',
  },
  {
    url: 'https://loratu.bitcointxoko.com',
    name: 'loratu.bitcointxoko.com',
    supportsMirror: true,
    status: 'ok',
    payment: 'free',
    notes: '',
  },
  {
    url: 'https://nostrmedia.com',
    name: 'nostrmedia.com',
    supportsMirror: true,
    status: 'ok',
    payment: 'paid',
    notes: 'Subscriptions at https://nostrmedia.com/#plan',
    price: 'from $2.99/month',
  },
]

const instanceOrigin = getInstanceConfig()?.origin

/**
 * Default upload servers for new users. Instance build: only the instance's own Blossom
 * (same origin, ADR 0004), never a public server.
 */
export const DEFAULT_UPLOAD_SERVERS = instanceOrigin ? [instanceOrigin] : DEFAULT_BLOSSOM_SERVERS

/**
 * Derive a display name from a server URL
 */
export function deriveServerName(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/**
 * Every configured Blossom server, flat. The upload strategy (`planUpload`) decides which of
 * them receive the file and which copy it, so the user never tags servers by hand.
 */
export function configuredServerUrls(servers?: BlossomServer[] | null): string[] {
  return (servers ?? []).map(server => server.url)
}

/** The servers uploads go to: every configured server the user has not switched off. */
export function uploadServerUrls(servers?: BlossomServer[] | null): string[] {
  return (servers ?? []).filter(server => server.upload !== false).map(server => server.url)
}

/** The list a user starts with: the instance's Blossom proxy, else the public defaults. */
export function defaultBlossomServers(proxyUrl?: string): BlossomServer[] {
  const urls = proxyUrl ? [proxyUrl, ...DEFAULT_UPLOAD_SERVERS] : DEFAULT_UPLOAD_SERVERS
  return [...new Set(urls)]
    .filter(url => !isBlossomServerBlocked(url))
    .map(url => ({ url, name: deriveServerName(url), tags: [] }))
}

/**
 * Cleans a stored server list (legacy or malformed entries) into `BlossomServer`s. Keeps the
 * `upload` switch; drops the old role tags, which no longer mean anything.
 */
export function normalizeBlossomServers(servers: unknown): BlossomServer[] {
  if (!Array.isArray(servers)) return []
  return servers
    .filter(
      (server): server is { url?: unknown; name?: unknown; upload?: unknown } =>
        typeof server === 'object' && server !== null
    )
    .map(server => {
      const url = typeof server.url === 'string' ? server.url : ''
      const name =
        typeof server.name === 'string' && server.name ? server.name : deriveServerName(url)
      const normalized: BlossomServer = { url, name, tags: [] }
      if (server.upload === false) normalized.upload = false
      return normalized
    })
    .filter(server => server.url.length > 0)
}

/** At least one server keeps uploads on: when none would, the first one is switched back on. */
function keepOneUploadServer(servers: BlossomServer[]): BlossomServer[] {
  if (servers.length === 0 || servers.some(server => server.upload !== false)) return servers
  const [first, ...rest] = servers
  return [{ ...first, upload: undefined }, ...rest].map(stripUnsetUpload)
}

function stripUnsetUpload(server: BlossomServer): BlossomServer {
  if (server.upload !== undefined) return server
  const { upload: _upload, ...rest } = server
  return rest
}

/** Switches uploads to one server on or off; switching off the last active server is refused. */
export function setServerUpload(
  servers: BlossomServer[],
  url: string,
  enabled: boolean
): BlossomServer[] {
  const next = servers.map(server =>
    server.url !== url
      ? server
      : stripUnsetUpload({ ...server, upload: enabled ? undefined : false })
  )
  if (!enabled && !next.some(server => server.upload !== false)) return servers
  return next
}

/** Removes a server; if it was the last active one, the first remaining server takes over. */
export function removeServer(servers: BlossomServer[], url: string): BlossomServer[] {
  return keepOneUploadServer(servers.filter(server => server.url !== url))
}

/** A stable fingerprint of a server list, independent of order and trailing slashes. */
export function serverListSignature(urls: string[]): string {
  return [...new Set(urls.map(normalizeServerUrl))].sort().join(' ')
}

/**
 * Merges the profile's kind 10063 list into the local list, but only when that list changed
 * since the last merge (`lastSignature`). A server the user removed locally therefore stays
 * removed until the profile list itself changes. Returns `null` when nothing is to be done.
 */
export function mergeProfileServers(
  current: BlossomServer[],
  profileUrls: string[],
  lastSignature: string | null
): { servers: BlossomServer[]; signature: string } | null {
  const signature = serverListSignature(profileUrls)
  if (profileUrls.length === 0 || signature === lastSignature) return null
  const known = new Set(current.map(server => normalizeServerUrl(server.url)))
  const added = profileUrls
    .filter(url => !isBlossomServerBlocked(url))
    .filter(url => {
      const key = normalizeServerUrl(url)
      if (known.has(key)) return false
      known.add(key)
      return true
    })
    .map(url => {
      const clean = normalizeServerUrl(url)
      return { url: clean, name: deriveServerName(clean), tags: [] }
    })
  return { servers: [...current, ...added], signature }
}
