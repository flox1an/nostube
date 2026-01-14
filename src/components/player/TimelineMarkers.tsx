import { useMemo, useState, memo, useRef, useEffect } from 'react'
import { formatDistanceToNow } from 'date-fns'

// Reuse interfaces from BulletComments
interface TimelineComment {
  id: number
  text: string
  videoTime: number // video timestamp in seconds
  ownerName: string
  ownerAvatar: string
  postedAt: Date
  zapAmount: number
}

// Demo users for random assignment
const DEMO_USERS = [
  { name: 'satoshi', avatar: 'https://i.pravatar.cc/150?u=satoshi' },
  { name: 'alice_nostr', avatar: 'https://i.pravatar.cc/150?u=alice' },
  { name: 'bob_zaps', avatar: 'https://i.pravatar.cc/150?u=bob' },
  { name: 'lightning_fan', avatar: 'https://i.pravatar.cc/150?u=lightning' },
  { name: 'nostr_dev', avatar: 'https://i.pravatar.cc/150?u=nostrdev' },
  { name: 'pleb21', avatar: 'https://i.pravatar.cc/150?u=pleb21' },
  { name: 'stackingsats', avatar: 'https://i.pravatar.cc/150?u=stacking' },
  { name: 'zap_queen', avatar: 'https://i.pravatar.cc/150?u=zapqueen' },
  { name: 'bitcoin_maxi', avatar: 'https://i.pravatar.cc/150?u=maxi' },
  { name: 'freedom_tech', avatar: 'https://i.pravatar.cc/150?u=freedom' },
]

// Sample comments (shorter subset for markers)
const DEMO_COMMENTS = [
  'lol',
  'nice!',
  '🔥🔥🔥',
  'based',
  'GOAT',
  '😂😂😂',
  'this is amazing',
  'bruh moment',
  '草',
  '666',
  'krass',
  'jaja',
  'legendary',
  '💀💀💀',
  'no way',
  'sheesh',
  '❤️',
  'W',
  'おもしろい',
  '太棒了',
  'fire',
  'perfect',
  '⚡️',
  'genius',
  'lets gooo',
]

interface TimelineMarkersProps {
  duration: number
  currentTime: number
  onSeekToMarker?: (time: number) => void
}

// Generate clustered timeline comments
function generateTimelineComments(duration: number): TimelineComment[] {
  if (duration <= 0) return []

  // Generate fewer comments for timeline markers (1 per 5 seconds, max 60)
  const count = Math.min(60, Math.floor(duration / 5))
  const comments: TimelineComment[] = []
  const now = Date.now()

  for (let i = 0; i < count; i++) {
    const owner = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)]
    // Higher zap amounts for bigger markers
    const zapAmount = Math.floor(1 + Math.random() * 500)

    comments.push({
      id: i,
      text: DEMO_COMMENTS[Math.floor(Math.random() * DEMO_COMMENTS.length)],
      videoTime: Math.random() * duration,
      ownerName: owner.name,
      ownerAvatar: owner.avatar,
      postedAt: new Date(now - Math.random() * 30 * 24 * 60 * 60 * 1000), // Up to 30 days ago
      zapAmount,
    })
  }

  return comments.sort((a, b) => a.videoTime - b.videoTime)
}

// Cluster nearby comments to avoid overlap
interface MarkerCluster {
  id: string
  position: number // percentage
  comments: TimelineComment[]
  totalZaps: number
}

function clusterComments(comments: TimelineComment[], duration: number): MarkerCluster[] {
  if (duration <= 0 || comments.length === 0) return []

  const clusters: MarkerCluster[] = []
  const clusterThreshold = 2 // percentage threshold for clustering

  for (const comment of comments) {
    const position = (comment.videoTime / duration) * 100

    // Find existing cluster within threshold
    const existingCluster = clusters.find(c => Math.abs(c.position - position) < clusterThreshold)

    if (existingCluster) {
      existingCluster.comments.push(comment)
      existingCluster.totalZaps += comment.zapAmount
      // Recalculate position as average
      existingCluster.position =
        existingCluster.comments.reduce((sum, c) => sum + (c.videoTime / duration) * 100, 0) /
        existingCluster.comments.length
    } else {
      clusters.push({
        id: `cluster-${comment.id}`,
        position,
        comments: [comment],
        totalZaps: comment.zapAmount,
      })
    }
  }

  return clusters
}

// Individual marker component
const TimelineMarker = memo(function TimelineMarker({
  cluster,
  isActive,
  onHover,
  onLeave,
  onClick,
}: {
  cluster: MarkerCluster
  isActive: boolean
  onHover: () => void
  onLeave: () => void
  onClick: () => void
}) {
  const topComment = cluster.comments[0]
  // Size based on total zaps (min 12px, max 28px for multiple comments)
  const baseSize = cluster.comments.length > 1 ? 16 : 12
  const zapBonus = Math.min(12, Math.floor(cluster.totalZaps / 100))
  const size = baseSize + zapBonus

  return (
    <div
      className="absolute bottom-0 transform -translate-x-1/2 cursor-pointer z-10 group flex flex-col items-center"
      style={{ left: `${cluster.position}%` }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
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
        {size >= 12 ? (
          <img
            src={topComment.ownerAvatar}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div
            className={`w-full h-full ${cluster.totalZaps > 100 ? 'bg-yellow-400' : 'bg-white/80'}`}
          />
        )}
      </div>

      {/* Vertical line indicator - extends down to connect to track */}
      <div className={`w-px bg-white/50 transition-all ${isActive ? 'h-4 bg-primary' : 'h-3'}`} />
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

  const showMultiple = cluster.comments.length > 1 && cluster.comments.length <= 3
  const displayComments = showMultiple ? cluster.comments : [cluster.comments[0]]

  // Calculate marker height to position tooltip above it
  const markerHeight = 28 + 12 // max marker size + line height

  return (
    <div
      ref={tooltipRef}
      className="absolute transform -translate-x-1/2 z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150"
      style={{ left: `${adjustedPosition}%`, bottom: `${markerHeight + 8}px` }}
    >
      <div className="bg-black/95 backdrop-blur-md rounded-lg shadow-2xl border border-white/10 overflow-hidden">
        {displayComments.map((comment, idx) => (
          <div
            key={comment.id}
            className={`px-3 py-2 ${idx > 0 ? 'border-t border-white/10' : ''}`}
          >
            <div className="flex items-start gap-2.5 min-w-[180px] max-w-[280px]">
              <img
                src={comment.ownerAvatar}
                alt={comment.ownerName}
                className="w-8 h-8 rounded-full flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white text-xs font-semibold truncate">
                    {comment.ownerName}
                  </span>
                  <span className="text-white/50 text-[10px]">
                    {formatDistanceToNow(comment.postedAt, { addSuffix: true })}
                  </span>
                </div>
                <p className="text-white/90 text-sm mt-0.5 break-words">{comment.text}</p>
                {comment.zapAmount > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-yellow-400 text-xs">⚡</span>
                    <span className="text-yellow-400 text-xs font-medium">
                      {comment.zapAmount.toLocaleString()} sats
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {cluster.comments.length > 3 && (
          <div className="px-3 py-1.5 bg-white/5 text-center">
            <span className="text-white/60 text-xs">
              +{cluster.comments.length - 1} more comments
            </span>
          </div>
        )}
        {cluster.comments.length > 1 && (
          <div className="px-3 py-1.5 bg-yellow-500/10 flex items-center justify-center gap-1.5">
            <span className="text-yellow-400 text-xs">⚡</span>
            <span className="text-yellow-400 text-xs font-semibold">
              {cluster.totalZaps.toLocaleString()} total sats
            </span>
          </div>
        )}
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
}: TimelineMarkersProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  // Generate comments once per duration
  const comments = useMemo(() => generateTimelineComments(duration), [duration])

  // Cluster comments to avoid overlap
  const clusters = useMemo(() => clusterComments(comments, duration), [comments, duration])

  // Find active cluster (near current time)
  const activeCluster = useMemo(() => {
    if (duration <= 0) return null
    const currentPosition = (currentTime / duration) * 100
    return clusters.find(c => Math.abs(c.position - currentPosition) < 1.5)
  }, [clusters, currentTime, duration])

  // Track container width for tooltip positioning
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth)
      }
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  const hoveredCluster = clusters.find(c => c.id === hoveredClusterId)
  // Show tooltip for hovered cluster, or active cluster if not hovering
  const tooltipCluster = hoveredCluster || activeCluster

  if (clusters.length === 0) return null

  return (
    <div ref={containerRef} className="relative w-full overflow-visible">
      {/* Markers container - markers position themselves above this line */}
      <div className="relative w-full pointer-events-auto">
        {clusters.map(cluster => (
          <TimelineMarker
            key={cluster.id}
            cluster={cluster}
            isActive={activeCluster?.id === cluster.id}
            onHover={() => setHoveredClusterId(cluster.id)}
            onLeave={() => setHoveredClusterId(null)}
            onClick={() => {
              const avgTime =
                cluster.comments.reduce((sum, c) => sum + c.videoTime, 0) / cluster.comments.length
              onSeekToMarker?.(avgTime)
            }}
          />
        ))}
      </div>

      {/* Tooltip - shown for hovered or active marker */}
      {tooltipCluster && <MarkerTooltip cluster={tooltipCluster} containerWidth={containerWidth} />}
    </div>
  )
})
