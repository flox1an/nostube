/**
 * What this browser has learned about Blossom servers from its own uploads, merged with the server
 * catalog. Feeds `planUpload` (`@nostube/core/upload-plan`), which turns the user's flat server
 * list into an upload strategy.
 */
import { normalizeServerUrl } from '@nostube/core/blossom-utils'
import type { ServerCapabilities } from '@nostube/core/upload-plan'
import { RECOMMENDED_BLOSSOM_SERVERS } from '@/lib/blossom-servers'

const STORAGE_KEY = 'nostube_blossom_capabilities'

/** Learned facts expire, so a server that later adds mirror support or a bigger limit gets retried. */
export const CAPABILITY_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** Weight of the newest throughput measurement in the running average. */
const THROUGHPUT_WEIGHT = 0.3

/** Smaller transfers are dominated by latency (thumbnails, HLS segments) and say little about speed. */
const MIN_THROUGHPUT_SAMPLE_BYTES = 4 * 1024 * 1024

/** HTTP statuses with which a server says it has no `PUT /mirror` endpoint. */
const MIRROR_UNSUPPORTED_STATUSES = new Set([404, 405, 501])

type Learned = ServerCapabilities & { updatedAt: number }

function load(): Record<string, Learned> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, Learned>) : {}
  } catch {
    return {}
  }
}

function save(all: Record<string, Learned>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // Storage full or blocked: learning is an optimisation, uploads work without it.
  }
}

function update(server: string, change: (current: ServerCapabilities) => ServerCapabilities) {
  const all = load()
  const key = normalizeServerUrl(server)
  const current = fresh(all[key])
  all[key] = { ...change(current ?? {}), updatedAt: Date.now() }
  save(all)
}

function fresh(entry: Learned | undefined, now = Date.now()): ServerCapabilities | undefined {
  if (!entry || now - entry.updatedAt > CAPABILITY_TTL_MS) return undefined
  const { updatedAt: _updatedAt, ...capabilities } = entry
  return capabilities
}

/** Parses catalog sizes such as `100MB` or `1.5 GB` into bytes. */
export function parseSizeLabel(label: string | undefined): number | undefined {
  const match = label?.trim().match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB)$/i)
  if (!match) return undefined
  const power = { KB: 1, MB: 2, GB: 3, TB: 4 }[match[2].toUpperCase() as 'KB' | 'MB' | 'GB' | 'TB']
  return Math.round(parseFloat(match[1]) * 1024 ** power)
}

function catalogCapabilities(server: string): ServerCapabilities {
  const entry = RECOMMENDED_BLOSSOM_SERVERS.find(s => normalizeServerUrl(s.url) === server)
  if (!entry) return {}
  return { mirror: entry.supportsMirror, maxFileSize: parseSizeLabel(entry.maxFileSize) }
}

/**
 * Capabilities for each server, keyed by normalized URL: the catalog first, then what this
 * browser learned, which wins where both know something.
 */
export function getServerCapabilities(servers: string[]): Record<string, ServerCapabilities> {
  const all = load()
  const result: Record<string, ServerCapabilities> = {}
  for (const server of servers) {
    const key = normalizeServerUrl(server)
    const learned = fresh(all[key]) ?? {}
    const merged = { ...catalogCapabilities(key) }
    for (const [field, value] of Object.entries(learned)) {
      if (value !== undefined) Object.assign(merged, { [field]: value })
    }
    result[key] = merged
  }
  return result
}

/**
 * Whether a failed `PUT /mirror` means the server has no mirror endpoint: one of the statuses
 * above, or a request the browser blocked (servers without the endpoint often send no CORS
 * headers on the error response).
 */
export function isMirrorUnsupported(error: Error): boolean {
  const status = (error as { status?: unknown }).status
  if (typeof status === 'number') return MIRROR_UNSUPPORTED_STATUSES.has(status)
  return error.name === 'TypeError'
}

/**
 * Records the outcome of a `PUT /mirror`. Success marks the server as mirroring; a status that
 * means "no such endpoint" marks it as not mirroring. Other failures (timeouts, 5xx, auth) say
 * nothing about mirror support and are ignored.
 */
export function recordMirrorResult(server: string, result: { ok: true } | { status: number }) {
  if ('ok' in result) update(server, current => ({ ...current, mirror: true }))
  else if (MIRROR_UNSUPPORTED_STATUSES.has(result.status)) {
    update(server, current => ({ ...current, mirror: false }))
  }
}

/** A 413 for a file of `fileSize` bytes: the server's limit is below that size. */
export function recordTooLarge(server: string, fileSize: number) {
  update(server, current => ({
    ...current,
    maxFileSize: Math.min(current.maxFileSize ?? Infinity, fileSize - 1),
  }))
}

/** Folds one measured direct upload into the server's running throughput average. */
export function recordThroughput(server: string, bytes: number, seconds: number) {
  if (bytes < MIN_THROUGHPUT_SAMPLE_BYTES || seconds <= 0) return
  const measured = bytes / (1024 * 1024) / seconds
  update(server, current => ({
    ...current,
    throughputMBps:
      current.throughputMBps === undefined
        ? measured
        : current.throughputMBps * (1 - THROUGHPUT_WEIGHT) + measured * THROUGHPUT_WEIGHT,
  }))
}
