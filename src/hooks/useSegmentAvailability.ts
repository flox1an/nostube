import { useEffect, useRef, useState } from 'react'
import type { SegmentStatus } from '@/components/hls-segment-grid'
import type { BlossomServer } from '@/contexts/AppContext'
import { blossomServerCandidates } from '@/lib/hls-playlist-fetch'

async function headOk(url: string, signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', signal })
    return response.ok
  } catch {
    return false
  }
}

/**
 * HEAD-checks segment URLs with max 6 concurrent requests. A segment the
 * playlist's own server does not have is retried on the other configured
 * Blossom servers and reported as `mirrored` when one of them holds it.
 */
export function useSegmentAvailability(
  segmentUrls: string[],
  enabled: boolean,
  configServers: BlossomServer[]
): SegmentStatus[] {
  const [statuses, setStatuses] = useState<SegmentStatus[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const serversRef = useRef(configServers)
  serversRef.current = configServers
  const urlsRef = useRef(segmentUrls)
  urlsRef.current = segmentUrls
  // Effects key on values, never on array identity: callers rebuild these
  // arrays every render, and re-running would abort every in-flight check and
  // restart it forever.
  const urlsKey = segmentUrls.join('\u0000')
  const serversKey = configServers.map(server => server.url).join('\u0000')

  useEffect(() => {
    const urls = urlsRef.current
    if (!enabled || urls.length === 0) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const servers = serversRef.current

    setStatuses(urls.map(() => 'pending'))

    const setStatus = (index: number, status: SegmentStatus) => {
      if (controller.signal.aborted) return
      setStatuses(prev => prev.map((s, j) => (j === index ? status : s)))
    }

    let next = 0
    // The whole variant usually lives on the same server, so the mirror that
    // answered first is tried first for the rest: one extra request per missing
    // segment instead of one per configured server.
    let stickyMirror: string | null = null

    const worker = async () => {
      while (next < urls.length && !controller.signal.aborted) {
        const index = next++
        setStatus(index, 'checking')
        const [own, ...mirrors] = blossomServerCandidates(urls[index], servers)

        if (await headOk(own, controller.signal)) {
          setStatus(index, 'available')
          continue
        }

        const ordered = stickyMirror
          ? [...mirrors.filter(mirror => mirror === stickyMirror), ...mirrors]
          : mirrors
        let status: SegmentStatus = 'unavailable'
        for (const mirror of new Set(ordered)) {
          if (controller.signal.aborted) return
          if (await headOk(mirror, controller.signal)) {
            status = 'mirrored'
            stickyMirror = mirror
            break
          }
        }
        setStatus(index, status)
      }
    }

    // ponytail: fixed 6-way concurrency, plenty for a debug panel
    void Promise.all(Array.from({ length: Math.min(6, urls.length) }, worker))

    return () => controller.abort()
  }, [urlsKey, serversKey, enabled])

  return statuses
}
