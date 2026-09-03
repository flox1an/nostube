import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { extractBlossomHash } from '@/utils/video-event'
import { useTranslation } from 'react-i18next'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Check,
  Circle,
  Loader2,
  X,
  Video,
  Image,
  Captions,
  ChevronRight,
  Radio,
  Film,
  Layers,
  Package,
  ChevronDown,
} from 'lucide-react'
import type { NostrEvent } from 'nostr-tools'
import type { BlossomServer } from '@/contexts/AppContext'
import type { VideoEvent, VideoVariant } from '@/utils/video-event'
import type { ContributedVariantDebugRecord } from '@/hooks/useContributedVariants'
import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { HlsSegmentGrid } from '@/components/hls-segment-grid'
import type { SegmentStatus } from '@/components/hls-segment-grid'
import { useAppContext } from '@/hooks/useAppContext'
import { DEFAULT_RELAYS, relayPool } from '@/nostr/core'
import type { ServerAvailability } from '@/hooks/useVideoServerAvailability'
import { useMultiVideoServerAvailability } from '@/hooks/useMultiVideoServerAvailability'
import { deduplicateVariants } from '@/lib/blossom-blob-extractor'

// ── HLS tree types ────────────────────────────────────────────────────────────

interface HlsStreamInfo {
  url: string // absolute URL
  bandwidth?: number
  resolution?: string
  codecs?: string
  segments: HlsSegment[]
  loadState: 'idle' | 'loading' | 'done' | 'error'
}

interface HlsSegment {
  url: string
  duration?: number
  isInit?: boolean
}

interface HlsMaster {
  streams: HlsStreamInfo[]
  loadState: 'idle' | 'loading' | 'done' | 'error'
  error?: string
}

/** Parse `#EXT-X-STREAM-INF:ATTR=VAL,...` attribute string */
function parseStreamInfAttrs(attrs: string): {
  bandwidth?: number
  resolution?: string
  codecs?: string
} {
  const out: Record<string, string> = {}
  const re = /([A-Z-]+)=(?:"([^"]*)"|([^,]*))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrs)) !== null) {
    out[m[1]] = m[2] !== undefined ? m[2] : m[3]
  }
  return {
    bandwidth: out['BANDWIDTH'] ? parseInt(out['BANDWIDTH']) : undefined,
    resolution: out['RESOLUTION'],
    codecs: out['CODECS'],
  }
}

/** Resolve a possibly-relative HLS URI against a base playlist URL */
function resolveHlsUrl(uri: string, baseUrl: string): string {
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri
  try {
    return new URL(uri, baseUrl).href
  } catch {
    return uri
  }
}

/** Parse a master playlist text into stream infos (URLs still relative) */
function parseMasterPlaylist(text: string, masterUrl: string): HlsStreamInfo[] {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
  const streams: HlsStreamInfo[] = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXT-X-STREAM-INF:')) {
      const attrs = parseStreamInfAttrs(lines[i].slice('#EXT-X-STREAM-INF:'.length))
      const uri = lines[i + 1]
      if (uri && !uri.startsWith('#')) {
        streams.push({
          url: resolveHlsUrl(uri, masterUrl),
          ...attrs,
          segments: [],
          loadState: 'idle',
        })
        i++
      }
    }
  }
  return streams
}

/** Parse a variant playlist text into segments */
function parseVariantPlaylist(text: string, variantUrl: string): HlsSegment[] {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
  const segments: HlsSegment[] = []
  let nextDuration: number | undefined

  for (const line of lines) {
    if (line.startsWith('#EXT-X-MAP:')) {
      const uriMatch = line.match(/URI="([^"]+)"/)
      if (uriMatch) {
        segments.push({ url: resolveHlsUrl(uriMatch[1], variantUrl), isInit: true })
      }
    } else if (line.startsWith('#EXTINF:')) {
      nextDuration = parseFloat(line.slice(8))
    } else if (!line.startsWith('#')) {
      segments.push({ url: resolveHlsUrl(line, variantUrl), duration: nextDuration })
      nextDuration = undefined
    }
  }
  return segments
}

// ── HLS node server check ─────────────────────────────────────────────────────

interface NodeCheck {
  url: string
  status: 'idle' | 'checking' | 'ok' | 'error'
  statusCode?: number
  contentLength?: number
  contentType?: string
  error?: string
}

function useNodeCheck(url: string | null, configServers: BlossomServer[]) {
  const [check, setCheck] = useState<NodeCheck>({ url: '', status: 'idle' })
  const [serverChecks, setServerChecks] = useState<
    { server: string; status: 'checking' | 'ok' | 'error'; code?: number; size?: number }[]
  >([])
  const serversRef = useRef(configServers)
  serversRef.current = configServers

  useEffect(() => {
    if (!url) return
    setCheck({ url, status: 'checking' })
    setServerChecks([])

    // Direct HEAD check on the URL
    fetch(url, { method: 'HEAD' })
      .then(r =>
        setCheck({
          url,
          status: r.ok ? 'ok' : 'error',
          statusCode: r.status,
          contentLength: r.headers.get('content-length')
            ? parseInt(r.headers.get('content-length')!)
            : undefined,
          contentType: r.headers.get('content-type') ?? undefined,
        })
      )
      .catch(() => setCheck({ url, status: 'error', error: 'Network error' }))

    // Per-server check: swap the server origin, keep the path
    const { sha256 } = extractBlossomHash(url)
    const servers = serversRef.current
    if (sha256 && servers.length > 0) {
      const checks = servers.map(s => ({ server: s.url, status: 'checking' as const }))
      setServerChecks(checks)
      servers.forEach((s, i) => {
        const serverBase = s.url.replace(/\/$/, '')
        const testUrl = `${serverBase}/${sha256}`
        fetch(testUrl, { method: 'HEAD' })
          .then(r =>
            setServerChecks(prev =>
              prev.map((c, j) =>
                j === i
                  ? {
                      ...c,
                      status: r.ok ? 'ok' : 'error',
                      code: r.status,
                      size: r.headers.get('content-length')
                        ? parseInt(r.headers.get('content-length')!)
                        : undefined,
                    }
                  : c
              )
            )
          )
          .catch(() =>
            setServerChecks(prev => prev.map((c, j) => (j === i ? { ...c, status: 'error' } : c)))
          )
      })
    }
  }, [url, configServers])

  return { check, serverChecks }
}

// ── Segment availability hook ─────────────────────────────────────────────────

/** HEAD-checks a list of segment URLs with max 6 concurrent requests. */
function useSegmentAvailability(segmentUrls: string[], enabled: boolean) {
  const [statuses, setStatuses] = useState<SegmentStatus[]>([])
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!enabled || segmentUrls.length === 0) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStatuses(segmentUrls.map(() => 'pending'))

    let active = 0
    const MAX = 6
    let idx = 0

    const checkNext = () => {
      while (active < MAX && idx < segmentUrls.length) {
        const i = idx++
        active++
        setStatuses(prev => prev.map((s, j) => (j === i ? 'checking' : s)))
        fetch(segmentUrls[i], { method: 'HEAD', signal: controller.signal })
          .then(r => {
            setStatuses(prev =>
              prev.map((s, j) => (j === i ? (r.ok ? 'available' : 'unavailable') : s))
            )
          })
          .catch(() => {
            if (!controller.signal.aborted) {
              setStatuses(prev => prev.map((s, j) => (j === i ? 'unavailable' : s)))
            }
          })
          .finally(() => {
            if (!controller.signal.aborted) {
              active--
              checkNext()
            }
          })
      }
    }
    checkNext()

    return () => controller.abort()
  }, [segmentUrls, enabled])

  return statuses
}

// ── Variant segment content (init items + availability grid) ─────────────────

function VariantSegmentContent({
  stream,
  nodeClass,
  shortUrl,
  onSelectUrl,
}: {
  stream: HlsStreamInfo
  nodeClass: (url: string) => string
  shortUrl: (url: string) => string
  onSelectUrl: (url: string) => void
}) {
  const nonInitSegments = stream.segments.filter(s => !s.isInit)
  const segmentUrls = useMemo(() => nonInitSegments.map(s => s.url), [nonInitSegments])
  const availabilityStatuses = useSegmentAvailability(
    segmentUrls,
    stream.loadState === 'done' && segmentUrls.length > 0
  )

  return (
    <div className="ml-5 space-y-1.5 mt-0.5">
      {/* Init file(s) — keep clickable */}
      {stream.segments
        .filter(s => s.isInit)
        .map((seg, i) => (
          <div key={i} className={nodeClass(seg.url)} onClick={() => onSelectUrl(seg.url)}>
            <Package className="w-3 h-3 shrink-0 text-orange-400" />
            <span className="truncate font-mono">init · {shortUrl(seg.url)}</span>
          </div>
        ))}

      {/* Segment availability grid */}
      {nonInitSegments.length > 0 && (
        <div className="px-1 pb-1">
          <HlsSegmentGrid
            streams={[
              {
                label: `${nonInitSegments.length} segments`,
                statuses:
                  availabilityStatuses.length > 0
                    ? availabilityStatuses
                    : nonInitSegments.map(() => 'pending' as const),
              },
            ]}
          />
        </div>
      )}

      {stream.loadState === 'error' && <div className="px-2 text-red-500">Failed to fetch</div>}
    </div>
  )
}

// ── HLS tree component ────────────────────────────────────────────────────────

// Renders only the tree (left panel). selectedUrl and onSelectUrl are controlled externally.
function HlsStreamTree({
  masterUrl,
  selectedUrl,
  onSelectUrl,
}: {
  masterUrl: string
  selectedUrl: string
  onSelectUrl: (url: string) => void
}) {
  const [master, setMaster] = useState<HlsMaster>({ streams: [], loadState: 'idle' })

  useEffect(() => {
    setMaster({ streams: [], loadState: 'loading' })
    fetch(masterUrl)
      .then(r => r.text())
      .then(text => {
        const streams = parseMasterPlaylist(text, masterUrl)
        setMaster({ streams, loadState: 'done' })
      })
      .catch(err => setMaster({ streams: [], loadState: 'error', error: String(err) }))
  }, [masterUrl])

  const expandVariant = useCallback((idx: number) => {
    setMaster(prev => {
      const stream = prev.streams[idx]
      if (!stream || stream.loadState !== 'idle') return prev
      const updated = prev.streams.map((s, i) =>
        i === idx ? { ...s, loadState: 'loading' as const } : s
      )
      fetch(stream.url)
        .then(r => r.text())
        .then(text => {
          const segments = parseVariantPlaylist(text, stream.url)
          setMaster(p => ({
            ...p,
            streams: p.streams.map((s, i) =>
              i === idx ? { ...s, segments, loadState: 'done' as const } : s
            ),
          }))
        })
        .catch(() => {
          setMaster(p => ({
            ...p,
            streams: p.streams.map((s, i) =>
              i === idx ? { ...s, loadState: 'error' as const } : s
            ),
          }))
        })
      return { ...prev, streams: updated }
    })
  }, [])

  const masterHash = extractBlossomHash(masterUrl).sha256
  const shortUrl = (url: string) => {
    const hash = extractBlossomHash(url).sha256
    return hash ? hash.slice(0, 12) + '…' : url.split('/').pop() || url
  }

  const nodeClass = (url: string) =>
    `flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer text-xs hover:bg-accent transition-colors ${selectedUrl === url ? 'bg-accent font-medium' : ''}`

  return (
    <div className="text-xs space-y-0.5">
      {/* Master playlist row */}
      <div className={nodeClass(masterUrl)} onClick={() => onSelectUrl(masterUrl)}>
        <Layers className="w-3.5 h-3.5 shrink-0 text-blue-500" />
        <span className="truncate font-mono">master.m3u8</span>
        {masterHash && (
          <span className="text-muted-foreground ml-auto shrink-0">{masterHash.slice(0, 6)}</span>
        )}
      </div>

      {master.loadState === 'loading' && (
        <div className="flex items-center gap-1.5 px-2 py-1 text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" /> Fetching…
        </div>
      )}
      {master.loadState === 'error' && (
        <div className="px-2 py-1 text-xs text-red-500">Failed to fetch master playlist</div>
      )}

      {master.streams.map((stream, si) => (
        <div key={si} className="ml-3">
          <Collapsible
            onOpenChange={open => {
              if (open) expandVariant(si)
            }}
          >
            <div className="flex items-center gap-0.5">
              <CollapsibleTrigger asChild>
                <button className="p-0.5 hover:bg-accent rounded">
                  <ChevronRight className="w-3 h-3 transition-transform data-[state=open]:rotate-90" />
                </button>
              </CollapsibleTrigger>
              <div
                className={nodeClass(stream.url)}
                onClick={() => onSelectUrl(stream.url)}
                style={{ flex: 1 }}
              >
                <Film className="w-3.5 h-3.5 shrink-0 text-purple-500" />
                <span className="truncate font-mono">
                  {stream.resolution ||
                    (stream.bandwidth
                      ? `${Math.round(stream.bandwidth / 1000)}kbps`
                      : `variant-${si}`)}
                </span>
                {stream.loadState === 'loading' && (
                  <Loader2 className="w-3 h-3 animate-spin ml-auto shrink-0" />
                )}
              </div>
            </div>

            <CollapsibleContent>
              <VariantSegmentContent
                stream={stream}
                nodeClass={nodeClass}
                shortUrl={shortUrl}
                onSelectUrl={onSelectUrl}
              />
            </CollapsibleContent>
          </Collapsible>
        </div>
      ))}
    </div>
  )
}

// Renders the right-panel details for a selected HLS node URL.
function HlsNodeDetails({ url, configServers }: { url: string; configServers: BlossomServer[] }) {
  const { check, serverChecks } = useNodeCheck(url, configServers)

  return (
    <div className="space-y-3">
      <div className="bg-muted/50 p-3 rounded-lg space-y-1 text-sm">
        <div>
          <span className="font-medium">URL: </span>
          <code className="text-xs break-all">{url}</code>
        </div>
        {extractBlossomHash(url).sha256 && (
          <div>
            <span className="font-medium">SHA256: </span>
            <code className="text-xs">{extractBlossomHash(url).sha256}</code>
          </div>
        )}
        {check.contentType && (
          <div>
            <span className="font-medium">Content-Type: </span>
            <span className="text-xs font-mono">{check.contentType}</span>
          </div>
        )}
        {check.contentLength !== undefined && (
          <div>
            <span className="font-medium">Size: </span>
            <span className="text-xs">{(check.contentLength / 1024).toFixed(1)} KB</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="font-medium">Direct: </span>
          {check.status === 'checking' && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
          )}
          {check.status === 'ok' && <Check className="w-3.5 h-3.5 text-green-500" />}
          {check.status === 'error' && <X className="w-3.5 h-3.5 text-red-500" />}
          <span
            className={`text-xs ${check.status === 'ok' ? 'text-green-600' : check.status === 'error' ? 'text-red-500' : 'text-muted-foreground'}`}
          >
            {check.status === 'checking'
              ? 'Checking…'
              : check.status === 'ok'
                ? `${check.statusCode}`
                : check.status === 'error'
                  ? (check.error ?? `${check.statusCode}`)
                  : '—'}
          </span>
        </div>
      </div>

      {serverChecks.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Blossom Servers ({serverChecks.length})</h4>
          <ul className="space-y-2">
            {serverChecks.map((sc, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                {sc.status === 'checking' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0 mt-0.5" />
                ) : sc.status === 'ok' ? (
                  <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <X className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <code className="text-xs block">{sc.server}</code>
                  <span
                    className={`text-xs ${sc.status === 'ok' ? 'text-green-600' : sc.status === 'error' ? 'text-red-500' : 'text-muted-foreground'}`}
                  >
                    {sc.status === 'checking'
                      ? 'Checking…'
                      : sc.status === 'ok'
                        ? `${sc.code}${sc.size ? ` · ${(sc.size / 1024).toFixed(1)} KB` : ''}`
                        : `${sc.code ?? 'Error'}`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
function contributedStatusClass(status: ContributedVariantDebugRecord['status']): string {
  switch (status) {
    case 'accepted':
      return 'text-green-600'
    case 'checking':
      return 'text-blue-600'
    case 'unavailable':
      return 'text-red-600'
    case 'invalid':
      return 'text-orange-600'
    default:
      return 'text-muted-foreground'
  }
}

export function ContributedVariantDebugSection({
  records,
}: {
  records: ContributedVariantDebugRecord[]
}) {
  if (records.length === 0) return null

  return (
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-2 font-semibold mb-2 hover:text-foreground/80 group">
        <ChevronRight className="w-4 h-4 transition-transform group-data-[state=open]:rotate-90" />
        Contributed Video Variants
        <span className="text-sm font-normal text-muted-foreground">({records.length})</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="bg-muted p-4 rounded-lg space-y-3">
          {records.map(record => (
            <div key={record.eventId} className="rounded-md border bg-background/60 p-3 text-sm">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`font-medium ${contributedStatusClass(record.status)}`}>
                  {record.status}
                </span>
                <span className="text-muted-foreground">kind {record.eventKind}</span>
                <span className="text-muted-foreground">{record.mediaType}</span>
                {record.quality && <span>{record.quality}</span>}
                {record.dimensions && (
                  <span className="text-muted-foreground">{record.dimensions}</span>
                )}
              </div>
              <div className="space-y-1">
                <div>
                  <span className="font-medium">Event: </span>
                  <code className="text-xs break-all">{record.eventId}</code>
                </div>
                <div>
                  <span className="font-medium">Pubkey: </span>
                  <code className="text-xs break-all">{record.pubkey}</code>
                </div>
                {record.hash && (
                  <div>
                    <span className="font-medium">Hash: </span>
                    <code className="text-xs break-all">{record.hash}</code>
                  </div>
                )}
                {record.url && (
                  <div>
                    <span className="font-medium">URL: </span>
                    <code className="text-xs break-all">{record.url}</code>
                  </div>
                )}
                {record.reachableUrl && (
                  <div>
                    <span className="font-medium">Reachable URL: </span>
                    <code className="text-xs break-all">{record.reachableUrl}</code>
                  </div>
                )}
                {record.statusCode && (
                  <div>
                    <span className="font-medium">HEAD status: </span>
                    <span className="text-xs">{record.statusCode}</span>
                  </div>
                )}
                {record.fallbackUrls.length > 0 && (
                  <div>
                    <span className="font-medium">Fallback URLs: </span>
                    <ul className="mt-1 space-y-1">
                      {record.fallbackUrls.map(url => (
                        <li key={url}>
                          <code className="text-xs break-all">{url}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {record.mimeType && (
                  <div>
                    <span className="font-medium">MIME Type: </span>
                    <code className="text-xs">{record.mimeType}</code>
                  </div>
                )}
                {record.error && (
                  <div>
                    <span className="font-medium">Error: </span>
                    <code className="text-xs break-all">{record.error}</code>
                  </div>
                )}
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">Tags</summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(record.tags, null, 2)}
                  </pre>
                </details>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

interface VideoDebugInfoProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  videoEvent: NostrEvent | null | undefined
  video: VideoEvent | null
  blossomServers?: BlossomServer[]
  contributedVariantDebugRecords?: ContributedVariantDebugRecord[]
  userServers?: string[]
}

// Helper function to render status icon
function renderStatusIcon(status: string) {
  switch (status) {
    case 'checking':
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
    case 'available':
      return <Check className="w-4 h-4 text-green-500 shrink-0" />
    case 'unavailable':
      return <X className="w-4 h-4 text-red-500 shrink-0" />
    case 'error':
      return <X className="w-4 h-4 text-orange-500 shrink-0" />
    default:
      return <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
  }
}

// Helper function to get status color
function getStatusColor(status: string) {
  switch (status) {
    case 'checking':
      return 'text-blue-500'
    case 'available':
      return 'text-green-500'
    case 'unavailable':
      return 'text-red-500'
    case 'error':
      return 'text-orange-500'
    default:
      return 'text-muted-foreground'
  }
}

// Helper function to get status text
function getStatusText(availability: ServerAvailability | undefined) {
  if (!availability) return 'Not checked'

  switch (availability.status) {
    case 'checking':
      return 'Checking...'
    case 'available':
      return availability.contentLength
        ? `Available (${(availability.contentLength / 1024 / 1024).toFixed(2)} MB)`
        : 'Available'
    case 'unavailable':
      return `Not found (${availability.statusCode})`
    case 'error':
      return 'Connection error'
    default:
      return 'Unknown'
  }
}

export function VideoDebugInfo({
  open,
  onOpenChange,
  videoEvent,
  video,
  blossomServers,
  contributedVariantDebugRecords = [],
  userServers,
}: VideoDebugInfoProps) {
  const { config } = useAppContext()
  const { t } = useTranslation()

  // Broadcast state
  const [broadcastStatus, setBroadcastStatus] = useState<
    'idle' | 'broadcasting' | 'done' | 'error'
  >('idle')
  const [broadcastResult, setBroadcastResult] = useState<{
    success: number
    failed: number
    total: number
  } | null>(null)
  const [selectedBroadcastRelays, setSelectedBroadcastRelays] = useState<string[]>([])

  const broadcastRelays = useMemo(() => {
    if (!videoEvent) return []

    // Combine all known relays: user's read + write relays, default relays, seen relays
    const userRelays = config.relays.map(r => r.url)
    const seenRelays = Array.from(getSeenRelays(videoEvent) || [])
    return Array.from(new Set([...userRelays, ...DEFAULT_RELAYS, ...seenRelays]))
  }, [videoEvent, config.relays])

  useEffect(() => {
    if (!open || !videoEvent) return
    setSelectedBroadcastRelays(broadcastRelays)
  }, [open, videoEvent, broadcastRelays])

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setBroadcastStatus('idle')
        setBroadcastResult(null)
      }
      onOpenChange(newOpen)
    },
    [onOpenChange]
  )

  const handleBroadcast = useCallback(async () => {
    if (!videoEvent || selectedBroadcastRelays.length === 0) return

    setBroadcastStatus('broadcasting')
    setBroadcastResult(null)

    try {
      const results = await relayPool.publish(selectedBroadcastRelays, videoEvent)
      const success = results.filter(r => r).length
      setBroadcastResult({
        success,
        failed: selectedBroadcastRelays.length - success,
        total: selectedBroadcastRelays.length,
      })
      setBroadcastStatus('done')
    } catch {
      setBroadcastStatus('error')
    }
  }, [videoEvent, selectedBroadcastRelays])

  // Deduplicate thumbnails with same URL or hash
  const deduplicatedThumbnails = useMemo(
    () => deduplicateVariants(video?.thumbnailVariants || []),
    [video?.thumbnailVariants]
  )

  // Debug: Log what variants we have
  if (import.meta.env.DEV && open) {
    console.debug('[VideoDebugInfo] Input data:', {
      allVideoVariants: video?.allVideoVariants?.length || 0,
      thumbnailVariants: video?.thumbnailVariants?.length || 0,
      deduplicatedThumbnails: deduplicatedThumbnails.length,
      textTracks: video?.textTracks?.length || 0,
      thumbnails: video?.thumbnailVariants,
      tracks: video?.textTracks,
    })
  }

  // Use multi-variant availability hook
  // Use allVideoVariants to show ALL variants including incompatible codecs for debugging
  const { allVariants, checkAllAvailability } = useMultiVideoServerAvailability({
    videoVariants: video?.allVideoVariants || [],
    thumbnailVariants: deduplicatedThumbnails,
    textTracks: video?.textTracks || [],
    configServers: blossomServers,
    userServers,
  })

  // Debug: Log what the hook returns
  if (import.meta.env.DEV && open) {
    console.debug('[VideoDebugInfo] Hook output:', {
      allVariantsCount: allVariants.length,
      allVariants: allVariants.map(v => ({ label: v.label, mimeType: v.variant.mimeType })),
    })
  }

  // Collect HLS master playlist URLs from video variants
  const hlsMasterUrls = useMemo(() => {
    const variants = video?.allVideoVariants || []
    return variants
      .filter(
        v =>
          v.mimeType === 'application/vnd.apple.mpegurl' ||
          v.mimeType === 'application/x-mpegurl' ||
          v.url?.endsWith('.m3u8')
      )
      .map(v => v.url)
      .filter(Boolean) as string[]
  }, [video?.allVideoVariants])

  // Selection state for the unified left/right panel
  type PanelSelection =
    { kind: 'variant'; idx: number } | { kind: 'hls'; masterUrl: string; nodeUrl: string }

  const nonHlsVariants = useMemo(
    () =>
      allVariants.filter(
        v =>
          v.variant.mimeType !== 'application/vnd.apple.mpegurl' &&
          v.variant.mimeType !== 'application/x-mpegurl'
      ),
    [allVariants]
  )

  const [selection, setSelection] = useState<PanelSelection | null>(null)

  // Default selection when data arrives
  useEffect(() => {
    if (selection !== null) return
    if (nonHlsVariants.length > 0) {
      setSelection({ kind: 'variant', idx: 0 })
    } else if (hlsMasterUrls.length > 0) {
      setSelection({ kind: 'hls', masterUrl: hlsMasterUrls[0], nodeUrl: hlsMasterUrls[0] })
    }
  }, [nonHlsVariants.length, hlsMasterUrls, selection])

  // Store checkAllAvailability in ref to avoid triggering effect on every state update
  const checkAllAvailabilityRef = useRef(checkAllAvailability)
  useEffect(() => {
    checkAllAvailabilityRef.current = checkAllAvailability
  }, [checkAllAvailability])

  // Trigger availability check when dialog opens (only on open transition)
  const prevOpenRef = useRef(open)
  useEffect(() => {
    // Only trigger when dialog opens (transitions from false to true)
    if (open && !prevOpenRef.current && allVariants.length > 0) {
      checkAllAvailabilityRef.current()
    }
    prevOpenRef.current = open
  }, [open, allVariants.length])

  // Helper function to render server availability for a variant
  const renderVariantServers = (
    variant: VideoVariant,
    serverAvailability: Map<string, ServerAvailability>
  ) => {
    const { sha256 } = extractBlossomHash(variant.url)
    const variantUrls = [variant.url, ...variant.fallbackUrls]

    return (
      <div className="space-y-4">
        {/* Variant Information */}
        <div className="bg-muted/50 p-3 rounded-lg">
          <div className="text-sm space-y-1">
            <div>
              <span className="font-medium">URL: </span>
              <code className="text-xs break-all">{variant.url}</code>
            </div>
            {sha256 && (
              <div>
                <span className="font-medium">SHA256: </span>
                <code className="text-xs">{sha256}</code>
              </div>
            )}
            {variant.quality && (
              <div>
                <span className="font-medium">Quality: </span>
                <span className="text-xs">{variant.quality}</span>
              </div>
            )}
            {variant.dimensions && (
              <div>
                <span className="font-medium">Dimensions: </span>
                <span className="text-xs">{variant.dimensions}</span>
              </div>
            )}
            {variant.size && (
              <div>
                <span className="font-medium">Size: </span>
                <span className="text-xs">{(variant.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            )}
            {variant.mimeType && (
              <div>
                <span className="font-medium">MIME Type: </span>
                <span className="text-xs font-mono">{variant.mimeType}</span>
              </div>
            )}
            {variant.hash && (
              <div>
                <span className="font-medium">Hash (x tag): </span>
                <code className="text-xs">{variant.hash}</code>
              </div>
            )}
          </div>
        </div>

        {/* Server Availability */}
        <div>
          <h4 className="text-sm font-medium mb-2">
            Server Availability ({Array.from(serverAvailability.values()).length})
          </h4>
          {serverAvailability.size > 0 ? (
            <ul className="space-y-2 text-sm">
              {Array.from(serverAvailability.values()).map((server, idx) => {
                const statusIcon = renderStatusIcon(server.status)
                const statusColor = getStatusColor(server.status)
                const statusText = getStatusText(server)

                return (
                  <li key={idx} className="flex items-start gap-2">
                    {statusIcon}
                    <div className="flex-1">
                      <code className="text-xs block">{server.url}</code>
                      <div className="text-xs text-muted-foreground">{server.name}</div>
                      <div className={`text-xs ${statusColor} font-medium`}>{statusText}</div>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No servers found</p>
          )}
        </div>

        {/* Fallback URLs */}
        {variantUrls.length > 1 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Fallback URLs ({variantUrls.length - 1})</h4>
            <ul className="space-y-1 text-sm">
              {variantUrls.slice(1).map((url, idx) => (
                <li key={idx} className="break-all">
                  <code className="text-xs text-muted-foreground">{url}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{t('errors.debugInfo')}</DialogTitle>
          <DialogDescription>{t('video.debugInfoDescription')}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[70vh] pr-4">
          <div className="space-y-6">
            {/* Full Event JSON - Collapsed by default */}
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 font-semibold mb-2 hover:text-foreground/80 group">
                <ChevronRight className="w-4 h-4 transition-transform group-data-[state=open]:rotate-90" />
                Nostr Event
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                  {JSON.stringify(videoEvent, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>

            {/* Relays & Broadcast */}
            <div>
              <h3 className="font-semibold mb-2">
                Relays ({videoEvent ? Array.from(getSeenRelays(videoEvent) || []).length : 0})
              </h3>
              <div className="bg-muted p-4 rounded-lg flex items-start justify-between gap-4">
                <div className="flex-1">
                  {videoEvent &&
                  getSeenRelays(videoEvent) &&
                  getSeenRelays(videoEvent)!.size > 0 ? (
                    <ul className="space-y-1 text-sm">
                      {Array.from(getSeenRelays(videoEvent)!).map((relay, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-green-500" />
                          <code className="text-xs">{relay}</code>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No relay information available</p>
                  )}
                </div>
                {videoEvent && (
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={
                            broadcastStatus === 'broadcasting' || broadcastRelays.length === 0
                          }
                          className="cursor-pointer"
                        >
                          {broadcastStatus === 'broadcasting' ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Radio className="h-4 w-4 mr-2" />
                          )}
                          {broadcastStatus === 'broadcasting'
                            ? 'Broadcasting...'
                            : `Broadcast (${selectedBroadcastRelays.length})`}
                          <ChevronDown className="h-4 w-4 ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="z-[100] w-80">
                        <DropdownMenuLabel>Broadcast to relays</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <div className="max-h-64 overflow-y-auto">
                          {broadcastRelays.map(relay => (
                            <DropdownMenuCheckboxItem
                              key={relay}
                              checked={selectedBroadcastRelays.includes(relay)}
                              onCheckedChange={checked => {
                                setBroadcastStatus('idle')
                                setBroadcastResult(null)
                                setSelectedBroadcastRelays(current =>
                                  checked
                                    ? Array.from(new Set([...current, relay]))
                                    : current.filter(selectedRelay => selectedRelay !== relay)
                                )
                              }}
                              onSelect={event => event.preventDefault()}
                            >
                              <code className="truncate text-xs">{relay}</code>
                            </DropdownMenuCheckboxItem>
                          ))}
                        </div>
                        <DropdownMenuSeparator />
                        <div className="p-1">
                          <Button
                            size="sm"
                            className="w-full cursor-pointer"
                            onClick={handleBroadcast}
                            disabled={
                              broadcastStatus === 'broadcasting' ||
                              selectedBroadcastRelays.length === 0
                            }
                          >
                            {broadcastStatus === 'broadcasting' ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Radio className="h-4 w-4 mr-2" />
                            )}
                            Broadcast Now
                          </Button>
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {broadcastStatus === 'done' && broadcastResult && (
                      <span className="text-sm text-green-600">
                        {broadcastResult.success}/{broadcastResult.total} relays
                      </span>
                    )}
                    {broadcastStatus === 'error' && (
                      <span className="text-sm text-red-500">Failed</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <ContributedVariantDebugSection records={contributedVariantDebugRecords} />

            {/* Unified variant + HLS panel */}
            {(nonHlsVariants.length > 0 || hlsMasterUrls.length > 0) && (
              <div>
                <h3 className="font-semibold mb-2">Blossom Server Availability by Variant</h3>
                <div className="flex gap-4">
                  {/* Left panel: variant buttons + HLS tree(s) */}
                  <div className="w-52 shrink-0 space-y-0.5">
                    {/* Non-HLS variant buttons */}
                    {nonHlsVariants.map((variantData, idx) => {
                      const mimeType = variantData.variant.mimeType || ''
                      let Icon = Image
                      if (mimeType.startsWith('video/')) Icon = Video
                      else if (mimeType.startsWith('text/')) Icon = Captions
                      const isSelected = selection?.kind === 'variant' && selection.idx === idx
                      return (
                        <button
                          key={idx}
                          onClick={() => setSelection({ kind: 'variant', idx })}
                          className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm text-left hover:bg-accent transition-colors ${isSelected ? 'bg-accent font-medium' : ''}`}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="truncate">{variantData.label}</span>
                        </button>
                      )
                    })}

                    {/* HLS trees */}
                    {hlsMasterUrls.map((masterUrl, idx) => (
                      <div key={masterUrl} className="mt-1">
                        {hlsMasterUrls.length > 1 && (
                          <div className="px-2 py-0.5 text-xs text-muted-foreground font-medium">
                            HLS Stream {idx + 1}
                          </div>
                        )}
                        <HlsStreamTree
                          masterUrl={masterUrl}
                          selectedUrl={
                            selection?.kind === 'hls' && selection.masterUrl === masterUrl
                              ? selection.nodeUrl
                              : ''
                          }
                          onSelectUrl={url =>
                            setSelection({ kind: 'hls', masterUrl, nodeUrl: url })
                          }
                        />
                      </div>
                    ))}
                  </div>

                  {/* Right panel */}
                  <div className="flex-1 min-w-0">
                    {selection?.kind === 'variant' && nonHlsVariants[selection.idx] && (
                      <div className="bg-muted p-4 rounded-lg">
                        {renderVariantServers(
                          nonHlsVariants[selection.idx].variant,
                          nonHlsVariants[selection.idx].serverAvailability
                        )}
                      </div>
                    )}
                    {selection?.kind === 'hls' && (
                      <HlsNodeDetails
                        url={selection.nodeUrl}
                        configServers={blossomServers ?? []}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Show message if no variants and no HLS */}
            {nonHlsVariants.length === 0 && hlsMasterUrls.length === 0 && (
              <div>
                <h3 className="font-semibold mb-2">Blossom Servers</h3>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    No video variants or thumbnails found
                  </p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
