/**
 * One namespaced localStorage cache with TTL, entry cap and a registry, so
 * "clear cache" and future caches share one pattern (#42). Purely a kv store:
 * modules with their own semantics (stale-while-revalidate, versioned envelopes,
 * in-memory mirrors) keep those and use this only for namespacing and safe JSON.
 */

export interface PersistentCacheOptions {
  /** Key namespace: entries live under `nostube:cache:<namespace>:<key>`. */
  namespace: string
  /** Entries older than this (ms) are expired on read. */
  ttl?: number
  /** Drop the oldest-written entries beyond this many (on set). */
  maxEntries?: number
  /** Whether `clearAllPersistentCaches()` clears this cache. Default true — set false for user data that only looks like a cache. */
  clearable?: boolean
}

interface Entry<T> {
  v: T
  /** Written at (ms), for maxEntries pruning. */
  w: number
  /** Expires at (ms). */
  e?: number
}

const PREFIX = 'nostube:cache:'

function fullKey(namespace: string, key: string): string {
  return `${PREFIX}${namespace}:${key}`
}

const registry = new Set<PersistentCache<never>>()

export class PersistentCache<T> {
  readonly namespace: string
  private readonly ttl?: number
  private readonly maxEntries?: number
  readonly clearable: boolean

  constructor(options: PersistentCacheOptions) {
    this.namespace = options.namespace
    this.ttl = options.ttl
    this.maxEntries = options.maxEntries
    this.clearable = options.clearable ?? true
    registry.add(this as unknown as PersistentCache<never>)
  }

  /** The value, or null when missing, unparseable or expired (expired entries are dropped). */
  get(key: string): T | null {
    const raw = localStorage.getItem(fullKey(this.namespace, key))
    if (raw === null) return null
    let entry: Entry<T>
    try {
      entry = JSON.parse(raw) as Entry<T>
    } catch {
      localStorage.removeItem(fullKey(this.namespace, key))
      return null
    }
    if (entry.e !== undefined && Date.now() > entry.e) {
      localStorage.removeItem(fullKey(this.namespace, key))
      return null
    }
    return entry.v
  }

  /** The value even when expired — for stale-while-revalidate readers. */
  getStale(key: string): T | null {
    try {
      const raw = localStorage.getItem(fullKey(this.namespace, key))
      return raw === null ? null : ((JSON.parse(raw) as Entry<T>).v ?? null)
    } catch {
      return null
    }
  }

  set(key: string, value: T): void {
    const entry: Entry<T> = { v: value, w: Date.now() }
    if (this.ttl !== undefined) entry.e = entry.w + this.ttl
    try {
      localStorage.setItem(fullKey(this.namespace, key), JSON.stringify(entry))
    } catch {
      // Quota or private mode: the cache stays best-effort.
      return
    }
    if (this.maxEntries !== undefined) this.prune()
  }

  delete(key: string): void {
    localStorage.removeItem(fullKey(this.namespace, key))
  }

  clear(): void {
    this.keys().forEach(key => localStorage.removeItem(fullKey(this.namespace, key)))
  }

  keys(): string[] {
    const prefix = `${PREFIX}${this.namespace}:`
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) keys.push(key.slice(prefix.length))
    }
    return keys
  }

  size(): number {
    return this.keys().length
  }

  private prune(): void {
    const entries = this.keys()
      .map(key => {
        const raw = localStorage.getItem(fullKey(this.namespace, key))
        let written = 0
        try {
          written = raw ? (JSON.parse(raw) as Entry<T>).w : 0
        } catch {
          // Unparseable entries are the oldest by definition.
        }
        return { key, written }
      })
      .sort((a, b) => a.written - b.written)

    for (const { key } of entries.slice(0, Math.max(0, entries.length - (this.maxEntries ?? 0)))) {
      this.delete(key)
    }
  }
}

/** Clears every registered cache that opted in (`clearable`, default true). */
export function clearAllPersistentCaches(): void {
  for (const cache of registry) {
    if (cache.clearable) cache.clear()
  }
}
