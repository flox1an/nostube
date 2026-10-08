import { useEffect, useMemo, useState } from 'react'
import {
  isHlsDebugEnabled,
  subscribeHlsFailoverDebug,
  type HlsFailoverDebugEntry,
} from '@/lib/hls-failover-debug'
import { extractBlossomHash } from '@/lib/blossom-url'

interface HlsFailoverDebugPanelProps {
  videoId?: string
}

const MAX_ENTRIES = 200

function stageLabel(stage: HlsFailoverDebugEntry['stage']): string {
  switch (stage) {
    case 'request':
      return 'Request'
    case 'retry':
      return 'Retry'
    case 'success':
      return 'OK'
    case 'failure':
      return 'Fail'
  }
}

function stageBadgeLabel(entry: HlsFailoverDebugEntry): string {
  if (entry.stage === 'failure' && entry.statusCode) {
    return `Fail ${entry.statusCode}`
  }
  if (entry.stage === 'failure' && entry.errorText) {
    return `Fail ${entry.errorText}`
  }
  return stageLabel(entry.stage)
}

function stageClass(stage: HlsFailoverDebugEntry['stage']): string {
  switch (stage) {
    case 'success':
      return 'text-green-600'
    case 'failure':
      return 'text-red-600'
    case 'retry':
      return 'text-orange-600'
    case 'request':
      return 'text-muted-foreground'
  }
}

export function HlsFailoverDebugPanel({ videoId }: HlsFailoverDebugPanelProps) {
  const [entries, setEntries] = useState<HlsFailoverDebugEntry[]>([])
  const [debugEnabled] = useState(() => isHlsDebugEnabled())

  useEffect(() => {
    if (!debugEnabled) return

    return subscribeHlsFailoverDebug(entry => {
      if (videoId && entry.videoId && entry.videoId !== videoId) return
      // Only keep terminal states in the panel
      if (entry.stage !== 'success' && entry.stage !== 'failure') return

      setEntries(prev => {
        // For successful requests keep only one OK per Blossom hash
        if (entry.stage === 'success') {
          const { sha256 } = extractBlossomHash(entry.candidateUrl)
          if (sha256) {
            const alreadyLogged = prev.some(
              e => e.stage === 'success' && extractBlossomHash(e.candidateUrl).sha256 === sha256
            )
            if (alreadyLogged) return prev
          }
        }

        return [entry, ...prev].slice(0, MAX_ENTRIES)
      })
    })
  }, [debugEnabled, videoId])

  const hasEntries = entries.length > 0

  const summary = useMemo(() => {
    const success = entries.filter(e => e.stage === 'success').length
    const failure = entries.filter(e => e.stage === 'failure').length
    return { success, failure }
  }, [entries])

  if (!debugEnabled) return null

  return (
    <div className="px-2 py-1 text-xs">
      <div className="mb-1 flex items-center gap-3">
        <span className="font-medium">HLS Failover Logs</span>
        <span className="text-muted-foreground">OK {summary.success}</span>
        <span className="text-muted-foreground">Fail {summary.failure}</span>
        <button
          type="button"
          className="ml-auto underline text-muted-foreground hover:text-foreground"
          onClick={() => setEntries([])}
        >
          Clear
        </button>
      </div>
      {!hasEntries && (
        <div className="text-muted-foreground">
          No HLS loader events yet. When `.m3u8` or segments load, logs appear here.
        </div>
      )}
      <div className="max-h-[30rem] overflow-y-auto overflow-x-auto font-mono leading-5">
        {entries.map(entry => (
          <div key={entry.id} className="whitespace-nowrap">
            <span className={stageClass(entry.stage)}>[{stageBadgeLabel(entry)}]</span>{' '}
            <span className="text-muted-foreground">
              {entry.attempt}/{entry.totalCandidates}
            </span>{' '}
            {entry.candidateUrl}
          </div>
        ))}
      </div>
    </div>
  )
}
