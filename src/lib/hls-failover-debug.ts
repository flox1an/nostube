export type HlsFailoverDebugStage = 'request' | 'retry' | 'success' | 'failure'

export interface HlsFailoverDebugEntry {
  id: string
  timestamp: number
  videoId?: string
  stage: HlsFailoverDebugStage
  requestUrl: string
  candidateUrl: string
  attempt: number
  totalCandidates: number
  errorText?: string
  statusCode?: number
}

const EVENT_NAME = 'nostube:hls-failover-debug'
export const HLS_DEBUG_STORAGE_KEY = 'nostube:hls-debug'

export function isHlsDebugEnabled() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(HLS_DEBUG_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function emitHlsFailoverDebug(entry: HlsFailoverDebugEntry) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<HlsFailoverDebugEntry>(EVENT_NAME, {
      detail: entry,
    })
  )
}

export function subscribeHlsFailoverDebug(
  listener: (entry: HlsFailoverDebugEntry) => void
): () => void {
  if (typeof window === 'undefined') return () => {}

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<HlsFailoverDebugEntry>
    if (customEvent.detail) {
      listener(customEvent.detail)
    }
  }

  window.addEventListener(EVENT_NAME, handler as EventListener)
  return () => window.removeEventListener(EVENT_NAME, handler as EventListener)
}
