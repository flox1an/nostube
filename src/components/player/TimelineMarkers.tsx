import { useMemo, useState, memo, useRef, useEffect, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useEventZaps } from '@/hooks/useEventZaps'
import { useProfile } from '@/hooks'
import { getInvoiceAmount } from '@/lib/zap-utils'
import type { NostrEvent } from 'nostr-tools'
import { Zap } from 'lucide-react'

// Format large numbers compactly (1000 -> 1k, 1000000 -> 1M)
function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 1) + 'M'
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(num % 1_000 === 0 ? 0 : 1) + 'k'
  }
  return num.toString()
}

interface TimelineZap {
  id: string
  text: string // comment or empty for flash symbol
  videoTime: number // video timestamp in seconds (from zap request or seeded random fallback)
  senderPubkey: string
  postedAt: Date
  zapAmount: number
}

interface TimelineMarkersProps {
  duration: number
  currentTime: number
  onSeekToMarker?: (time: number) => void
  eventId?: string
  authorPubkey?: string
}

// Parse a zap event to extract sender info and amount
function parseZapEvent(
  zap: NostrEvent,
  duration: number,
  seededRandom: () => number
): TimelineZap | null {
  try {
    // Get bolt11 from tags to calculate amount
    const bolt11Tag = zap.tags.find(t => t[0] === 'bolt11')
    const bolt11 = bolt11Tag?.[1]
    if (!bolt11) return null

    const zapAmount = getInvoiceAmount(bolt11)
    if (zapAmount <= 0) return null

    // Get the zap request from description tag (contains sender info and comment)
    const descriptionTag = zap.tags.find(t => t[0] === 'description')
    const descriptionJson = descriptionTag?.[1]
    if (!descriptionJson) return null

    const zapRequest = JSON.parse(descriptionJson) as NostrEvent
    const senderPubkey = zapRequest.pubkey
    const comment = zapRequest.content || '' // Empty if no comment

    // Check for timestamp tag in the zap request (for timestamped zaps)
    const timestampTag = zapRequest.tags.find(t => t[0] === 'timestamp')
    const timestampSeconds = timestampTag ? parseInt(timestampTag[1], 10) : null

    // Use the actual timestamp if valid and within duration, otherwise use seeded random
    let videoTime: number
    if (
      timestampSeconds !== null &&
      !isNaN(timestampSeconds) &&
      timestampSeconds >= 0 &&
      timestampSeconds <= duration
    ) {
      videoTime = timestampSeconds
    } else {
      // Fallback to seeded random for zaps without timestamp
      videoTime = seededRandom() * duration
    }

    return {
      id: zap.id,
      text: comment,
      videoTime,
      senderPubkey,
      postedAt: new Date(zap.created_at * 1000),
      zapAmount,
    }
  } catch {
    return null
  }
}

// Create a seeded random number generator for consistent random positions
function createSeededRandom(seed: string): () => number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }

  return () => {
    hash = Math.imul(hash ^ (hash >>> 15), hash | 1)
    hash ^= hash + Math.imul(hash ^ (hash >>> 7), hash | 61)
    return ((hash ^ (hash >>> 14)) >>> 0) / 4294967296
  }
}

// Cluster nearby zaps to avoid overlap
interface MarkerCluster {
  id: string
  position: number // percentage
  zaps: TimelineZap[]
  totalZaps: number
}

function clusterZaps(zaps: TimelineZap[], duration: number): MarkerCluster[] {
  if (duration <= 0 || zaps.length === 0) return []

  const clusters: MarkerCluster[] = []
  const clusterThreshold = 2 // percentage threshold for clustering

  for (const zap of zaps) {
    const position = (zap.videoTime / duration) * 100

    // Find existing cluster within threshold
    const existingCluster = clusters.find(c => Math.abs(c.position - position) < clusterThreshold)

    if (existingCluster) {
      existingCluster.zaps.push(zap)
      existingCluster.totalZaps += zap.zapAmount
      // Recalculate position as average
      existingCluster.position =
        existingCluster.zaps.reduce((sum, z) => sum + (z.videoTime / duration) * 100, 0) /
        existingCluster.zaps.length
    } else {
      clusters.push({
        id: `cluster-${zap.id}`,
        position,
        zaps: [zap],
        totalZaps: zap.zapAmount,
      })
    }
  }

  return clusters
}

// Avatar component that fetches profile
const ZapperAvatar = memo(function ZapperAvatar({
  pubkey,
  size,
}: {
  pubkey: string
  size: number
}) {
  const profile = useProfile({ pubkey })

  if (profile?.picture) {
    return (
      <img src={profile.picture} alt="" className="w-full h-full object-cover" loading="lazy" />
    )
  }

  // Fallback: white background with lightning icon
  return (
    <div className="w-full h-full bg-white/80 flex items-center justify-center">
      <Zap className="text-black" style={{ width: size * 0.6, height: size * 0.6 }} />
    </div>
  )
})

// Individual marker component
const TimelineMarker = memo(function TimelineMarker({
  cluster,
  isActive,
  onHoverChange,
  onSeek,
}: {
  cluster: MarkerCluster
  isActive: boolean
  onHoverChange: (clusterId: string | null) => void
  onSeek: (time: number) => void
}) {
  const topZap = cluster.zaps[0]
  // Size based on zap amount (min 12px, max 24px)
  const baseSize = 12
  const zapBonus = Math.min(12, Math.floor(cluster.totalZaps / 500))
  const size = baseSize + zapBonus

  const handleMouseEnter = useCallback(() => {
    onHoverChange(cluster.id)
  }, [cluster.id, onHoverChange])

  const handleMouseLeave = useCallback(() => {
    onHoverChange(null)
  }, [onHoverChange])

  const handleClick = useCallback(() => {
    const avgTime = cluster.zaps.reduce((sum, z) => sum + z.videoTime, 0) / cluster.zaps.length
    onSeek(avgTime)
  }, [cluster.zaps, onSeek])

  return (
    <div
      className="absolute bottom-0 transform -translate-x-1/2 cursor-pointer z-10 group flex flex-col items-center"
      style={{ left: `${cluster.position}%` }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {/* Marker dot/avatar - sits above the line */}
      <div
        className={`rounded-full border shadow-lg transition-all duration-150 overflow-hidden ${
          isActive ? 'scale-125 border-primary border-2' : 'border-white/60 hover:scale-110'
        }`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
        }}
      >
        <ZapperAvatar pubkey={topZap.senderPubkey} size={size} />
      </div>

      {/* Vertical line indicator - extends down to connect to track */}
      <div className={`w-px transition-all ${isActive ? 'h-4 bg-primary' : 'h-3 bg-white/50'}`} />
    </div>
  )
})

// Tooltip component for marker hover
const MarkerTooltip = memo(function MarkerTooltip({
  cluster,
  containerWidth,
}: {
  cluster: MarkerCluster
  containerWidth: number
}) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [adjustedPosition, setAdjustedPosition] = useState(cluster.position)
  const zap = cluster.zaps[0]
  const profile = useProfile({ pubkey: zap.senderPubkey })

  // Adjust tooltip position to keep it within bounds
  useEffect(() => {
    if (tooltipRef.current && containerWidth > 0) {
      const tooltipWidth = tooltipRef.current.offsetWidth
      const leftEdge = (cluster.position / 100) * containerWidth - tooltipWidth / 2
      const rightEdge = leftEdge + tooltipWidth

      if (leftEdge < 0) {
        setAdjustedPosition((tooltipWidth / 2 / containerWidth) * 100)
      } else if (rightEdge > containerWidth) {
        setAdjustedPosition(100 - (tooltipWidth / 2 / containerWidth) * 100)
      } else {
        setAdjustedPosition(cluster.position)
      }
    }
  }, [cluster.position, containerWidth])

  const displayName = profile?.display_name || profile?.name || zap.senderPubkey.slice(0, 8)

  // Calculate marker height to position tooltip above it
  const markerHeight = 24 + 12 // max marker size + line height

  return (
    <div
      ref={tooltipRef}
      className="absolute transform -translate-x-1/2 z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150"
      style={{ left: `${adjustedPosition}%`, bottom: `${markerHeight + 8}px` }}
    >
      <div className="bg-black/95 backdrop-blur-md rounded-lg shadow-2xl border border-white/10 overflow-hidden">
        <div className="px-3 py-2">
          <div className="flex items-start gap-2.5 max-w-[280px]">
            <div className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden">
              <ZapperAvatar pubkey={zap.senderPubkey} size={32} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-white text-xs font-semibold truncate">{displayName}</span>
                <span className="text-white/50 text-[10px]">
                  {formatDistanceToNow(zap.postedAt, { addSuffix: true })}
                </span>
              </div>
              {zap.text ? (
                <p className="text-white/90 text-sm mt-0.5 break-words">{zap.text}</p>
              ) : (
                <p className="text-white/50 text-sm mt-0.5 italic flex items-center gap-1">
                  <Zap className="w-3 h-3 text-yellow-400" />
                  zapped
                </p>
              )}
              <div className="flex items-center gap-1 mt-1">
                <span className="text-yellow-400 text-xs">⚡</span>
                <span className="text-yellow-400 text-xs font-medium">
                  {formatCompactNumber(zap.zapAmount)} sats
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Arrow pointing down */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-black/95"
        style={{ top: '100%' }}
      />
    </div>
  )
})

export const TimelineMarkers = memo(function TimelineMarkers({
  duration,
  currentTime,
  onSeekToMarker,
  eventId,
  authorPubkey,
}: TimelineMarkersProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  // Fetch actual zaps for this video
  const { zaps } = useEventZaps(eventId || '', authorPubkey || '')

  // Parse zaps into timeline format with random timestamps
  const timelineZaps = useMemo(() => {
    if (!zaps || zaps.length === 0 || duration <= 0 || !eventId) return []

    // Create seeded random for consistent positions per video
    const seededRandom = createSeededRandom(eventId)

    const parsed: TimelineZap[] = []
    for (const zap of zaps) {
      const timelineZap = parseZapEvent(zap, duration, seededRandom)
      if (timelineZap) {
        parsed.push(timelineZap)
      }
    }

    return parsed.sort((a, b) => a.videoTime - b.videoTime)
  }, [zaps, duration, eventId])

  // Cluster zaps to avoid overlap
  const clusters = useMemo(() => clusterZaps(timelineZaps, duration), [timelineZaps, duration])

  // Find active cluster (near current time)
  const activeCluster = useMemo(() => {
    if (duration <= 0) return null
    const currentPosition = (currentTime / duration) * 100
    return clusters.find(c => Math.abs(c.position - currentPosition) < 1.5)
  }, [clusters, currentTime, duration])

  // Track container width for tooltip positioning (use ResizeObserver for theater mode changes)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateWidth = () => {
      setContainerWidth(container.offsetWidth)
    }
    updateWidth()

    const resizeObserver = new ResizeObserver(updateWidth)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [])

  // Memoize hovered cluster lookup
  const hoveredCluster = useMemo(
    () => clusters.find(c => c.id === hoveredClusterId),
    [clusters, hoveredClusterId]
  )

  // Memoize active zap for tooltip
  const activeZap = useMemo(
    () => (activeCluster && !hoveredCluster ? activeCluster.zaps[0] : null),
    [activeCluster, hoveredCluster]
  )

  // Stable callback for hover changes
  const handleHoverChange = useCallback((clusterId: string | null) => {
    setHoveredClusterId(clusterId)
  }, [])

  // Stable callback for seeking
  const handleSeek = useCallback(
    (time: number) => {
      onSeekToMarker?.(time)
    },
    [onSeekToMarker]
  )

  if (clusters.length === 0) return null

  return (
    <div ref={containerRef} className="relative w-full h-8 overflow-visible">
      {/* Markers container - markers position themselves above this line */}
      <div className="relative w-full h-full pointer-events-auto">
        {clusters.map(cluster => (
          <TimelineMarker
            key={cluster.id}
            cluster={cluster}
            isActive={activeCluster?.id === cluster.id}
            onHoverChange={handleHoverChange}
            onSeek={handleSeek}
          />
        ))}
      </div>

      {/* Full tooltip - only shown on hover */}
      {hoveredCluster && <MarkerTooltip cluster={hoveredCluster} containerWidth={containerWidth} />}

      {/* Simple text tooltip - shown for active marker when not hovering */}
      {activeZap && activeCluster && (
        <div
          className="absolute transform -translate-x-1/2 z-40 pointer-events-none animate-in fade-in duration-150"
          style={{ left: `${activeCluster.position}%`, bottom: '48px' }}
        >
          <div className="px-2 py-1 bg-black/60 rounded text-white text-sm whitespace-nowrap max-w-[200px] truncate flex items-center gap-1">
            {activeZap.text || (
              <>
                <Zap className="w-3 h-3 text-yellow-400" />
                <span className="text-yellow-400">
                  {formatCompactNumber(activeZap.zapAmount)} sats
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
