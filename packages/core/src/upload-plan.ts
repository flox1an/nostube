import { normalizeServerUrl } from './blossom-utils'

/**
 * What the app knows about one Blossom server, learned from earlier uploads or a server catalog.
 * `planUpload` looks it up by the normalized server URL (`normalizeServerUrl`).
 * Every field is optional: unknown means "not tried yet", never "no".
 */
export interface ServerCapabilities {
  /** BUD-04 `PUT /mirror`: true after a mirror worked, false after the server refused it. */
  mirror?: boolean
  /** Largest blob in bytes the server accepts (catalog entry or a learned 413). */
  maxFileSize?: number
  /** Upload throughput in MB/s measured from this browser, smoothed over earlier uploads. */
  throughputMBps?: number
}

/** How one server receives the file. */
export type UploadMethod = 'upload' | 'mirror'

export interface UploadTarget {
  server: string
  /**
   * `upload`: the browser sends the file. `mirror`: the server copies it from the first target;
   * when that fails, the executor falls back to `upload`.
   */
  method: UploadMethod
}

export interface UploadPlan {
  /** Servers that accept the file. The first is the primary: it always gets a direct upload. */
  targets: UploadTarget[]
  /** Servers left out, with the reason. */
  skipped: { server: string; reason: 'too-large' }[]
}

/**
 * A measured server takes the primary role from the user's first server only when it is at least
 * this much faster, so a small measurement difference never reorders the user's list.
 */
export const PRIMARY_SPEEDUP = 2

/**
 * Turns the user's flat, ordered server list (BUD-03: the first is the most trusted) into an upload
 * strategy for one file: one direct upload to the primary, copies for the rest. The primary is the
 * first server that accepts the file, unless another one is measured `PRIMARY_SPEEDUP` times
 * faster. Servers known not to mirror get a direct upload too.
 */
export function planUpload(
  servers: string[],
  capabilities: Record<string, ServerCapabilities>,
  fileSize: number
): UploadPlan {
  const caps = (server: string) => capabilities[server] ?? {}
  const unique = [...new Set(servers.map(normalizeServerUrl))]

  const skipped: UploadPlan['skipped'] = []
  const accepting = unique.filter(server => {
    const max = caps(server).maxFileSize
    if (max !== undefined && fileSize > max) {
      skipped.push({ server, reason: 'too-large' })
      return false
    }
    return true
  })
  if (accepting.length === 0) return { targets: [], skipped }

  let primary = accepting[0]
  const firstSpeed = caps(primary).throughputMBps
  if (firstSpeed !== undefined) {
    for (const server of accepting.slice(1)) {
      const speed = caps(server).throughputMBps
      const best = caps(primary).throughputMBps ?? firstSpeed
      if (speed !== undefined && speed >= firstSpeed * PRIMARY_SPEEDUP && speed > best) {
        primary = server
      }
    }
  }

  const targets: UploadTarget[] = [
    { server: primary, method: 'upload' },
    ...accepting
      .filter(server => server !== primary)
      .map(server => ({
        server,
        method: (caps(server).mirror === false ? 'upload' : 'mirror') as UploadMethod,
      })),
  ]
  return { targets, skipped }
}
