import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Hls from 'hls.js'
import { useAppContextSafe } from '@/hooks/useAppContext'
import { createBlossomHlsLoader } from '@/lib/hls-blossom-loader'
import { isHlsDebugEnabled } from '@/lib/hls-failover-debug'
import type { BlossomServer, CachingServer } from '@/contexts/AppContext'
import type { PlaybackUrlLadder } from '@/lib/playback-url-ladder'

export interface HlsQualityLevel {
  index: number
  height: number
  width: number
  bitrate: number
  label: string
}

interface UseHlsResult {
  levels: HlsQualityLevel[]
  currentLevel: number // -1 = auto
  activeLevel: number | null
  setLevel: (level: number) => void
  isLoading: boolean
  error: string | null
}

// Empty array constant to avoid new array on every render
const EMPTY_LEVELS: HlsQualityLevel[] = []
const EMPTY_BLOSSOM_SERVERS: BlossomServer[] = []
const EMPTY_CACHING_SERVERS: CachingServer[] = []

function getHighestLevelIndex(levels: HlsQualityLevel[]) {
  return [...levels].sort((a, b) => b.height - a.height || b.bitrate - a.bitrate)[0]?.index
}

function getLowestLevel(levels: HlsQualityLevel[]) {
  return [...levels].sort((a, b) => a.height - b.height || a.bitrate - b.bitrate)[0]
}

function getInitialBandwidthEstimate(levels: HlsQualityLevel[], initialLevel: number) {
  const level = levels.find(candidate => candidate.index === initialLevel)
  if (!level?.bitrate) return undefined

  // hls.js applies abrBandWidthFactor before selecting a level. Give the chosen
  // initial rendition enough headroom so Auto does not immediately undo startLevel.
  return Math.ceil(level.bitrate / 0.95)
}

function formatBitrate(bitsPerSecond?: number) {
  if (!bitsPerSecond || Number.isNaN(bitsPerSecond)) return 'unknown'
  return `${(bitsPerSecond / 1_000_000).toFixed(2)} Mbps`
}

function logHlsJson(label: string, details: Record<string, unknown>) {
  if (!isHlsDebugEnabled()) return
  console.info(`[HLS:JSON] ${label} ${JSON.stringify(details)}`)
}

/**
 * Hook to manage hls.js instance and quality levels
 */
export function useHls(
  videoRef: React.RefObject<HTMLMediaElement | null>,
  src: string | null,
  isHlsSource: boolean,
  ladder?: PlaybackUrlLadder,
  authorPubkey?: string,
  videoId?: string,
  localhostProxyMode: 'always' | 'master-gated' | 'never' = 'master-gated'
): UseHlsResult {
  const hlsRef = useRef<Hls | null>(null)
  const appContext = useAppContextSafe()
  const blossomServers = appContext?.config.blossomServers ?? EMPTY_BLOSSOM_SERVERS
  const cachingServers = appContext?.config.cachingServers ?? EMPTY_CACHING_SERVERS
  // State for HLS-specific data (set via HLS event callbacks)
  const [hlsLevels, setHlsLevels] = useState<HlsQualityLevel[]>(EMPTY_LEVELS)
  const [hlsCurrentLevel, setHlsCurrentLevel] = useState(-1)
  const [hlsActiveLevel, setHlsActiveLevel] = useState<number | null>(null)
  const [hlsLoading, setHlsLoading] = useState(false)
  const [hlsError, setHlsError] = useState<string | null>(null)
  // Track the source we initialized HLS with
  const [initializedSrc, setInitializedSrc] = useState<string | null>(null)

  // Determine if HLS should be active
  const shouldBeActive = useMemo(() => {
    return Boolean(src && isHlsSource)
  }, [src, isHlsSource])

  // Compute whether we're actually active (HLS initialized with current src)
  const isActive = shouldBeActive && initializedSrc === src

  // Return empty state when not active
  const levels = isActive ? hlsLevels : EMPTY_LEVELS
  const currentLevel = isActive ? hlsCurrentLevel : -1
  const activeLevel = isActive ? hlsActiveLevel : null
  const isLoading = isActive ? hlsLoading : false
  const error = isActive ? hlsError : null

  // Initialize or destroy HLS instance
  useEffect(() => {
    const video = videoRef.current

    // Cleanup and exit if we shouldn't be active
    if (!shouldBeActive || !video || !src) {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      // Reset state via timeout to avoid sync setState in effect
      setTimeout(() => {
        setInitializedSrc(null)
        setHlsLevels(EMPTY_LEVELS)
        setHlsCurrentLevel(-1)
        setHlsActiveLevel(null)
        setHlsLoading(false)
        setHlsError(null)
      }, 0)
      return
    }

    // Check if HLS is supported
    if (!Hls.isSupported()) {
      // Try native HLS support (Safari)
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src
        setTimeout(() => setInitializedSrc(src), 0)
        return
      }
      setTimeout(() => setHlsError('HLS is not supported in this browser'), 0)
      return
    }

    // Mark loading via timeout
    setTimeout(() => {
      setHlsLoading(true)
      setHlsError(null)
      setInitializedSrc(src)
    }, 0)

    const hls = new Hls({
      autoStartLoad: false,
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 90,
      abrMaxWithRealBitrate: true,
      loader: createBlossomHlsLoader({
        blossomServers,
        cachingServers,
        authorPubkey,
        videoId,
        masterUrl: src,
        localhostProxyMode,
        ladder,
      }),
    })

    hlsRef.current = hls

    hls.loadSource(src)
    hls.attachMedia(video)

    const logAutoState = (label: string, extra?: Record<string, unknown>) => {
      if (!isHlsDebugEnabled()) return
      const details = {
        autoLevelEnabled: hls.autoLevelEnabled,
        currentLevel: hls.currentLevel,
        loadLevel: hls.loadLevel,
        nextAutoLevel: hls.nextAutoLevel,
        startLevel: hls.startLevel,
        firstLevel: hls.firstLevel,
        bandwidthEstimate: formatBitrate(hls.bandwidthEstimate),
        bandwidthEstimateBps: Number.isNaN(hls.bandwidthEstimate) ? null : hls.bandwidthEstimate,
        abrDefaultEstimate: formatBitrate(hls.abrEwmaDefaultEstimate),
        abrDefaultEstimateBps: Number.isNaN(hls.abrEwmaDefaultEstimate)
          ? null
          : hls.abrEwmaDefaultEstimate,
        abrBandWidthFactor: hls.config.abrBandWidthFactor,
        abrBandWidthUpFactor: hls.config.abrBandWidthUpFactor,
        minAutoBitrate: formatBitrate(hls.config.minAutoBitrate),
        minAutoBitrateBps: hls.config.minAutoBitrate,
        autoLevelCapping: hls.autoLevelCapping,
        minAutoLevel: hls.minAutoLevel,
        maxAutoLevel: hls.maxAutoLevel,
        levels: hls.levels?.map((level, index) => ({
          index,
          height: level.height,
          width: level.width,
          bitrate: formatBitrate(level.bitrate),
          bitrateBps: level.bitrate,
          averageBitrateBps: level.averageBitrate,
          maxBitrateBps: level.maxBitrate,
          loadError: level.loadError,
          url: level.url?.[0],
        })),
        ...extra,
      }
      console.info('[HLS]', label, details)
      logHlsJson(label, details)
    }

    let startupAutoFloorTimer: number | null = null
    let startupAutoFloorActive = false

    const releaseStartupAutoFloor = (reason: string) => {
      if (startupAutoFloorTimer !== null) {
        window.clearTimeout(startupAutoFloorTimer)
        startupAutoFloorTimer = null
      }

      if (!startupAutoFloorActive) return
      startupAutoFloorActive = false
      hls.config.minAutoBitrate = 0
      logAutoState('startup auto floor released', { reason })
    }

    const releaseStartupAutoFloorForBufferPressure = () => {
      releaseStartupAutoFloor('buffer pressure')
    }

    video.addEventListener('waiting', releaseStartupAutoFloorForBufferPressure)
    video.addEventListener('stalled', releaseStartupAutoFloorForBufferPressure)

    hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
      setHlsLoading(false)
      setHlsActiveLevel(null)
      const qualityLevels: HlsQualityLevel[] = data.levels.map((level, index) => ({
        index,
        height: level.height,
        width: level.width,
        bitrate: level.bitrate,
        label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)}kbps`,
      }))
      // Sort by height descending, falling back to bitrate for playlists without resolution metadata
      qualityLevels.sort((a, b) => b.height - a.height || b.bitrate - a.bitrate)
      setHlsLevels(qualityLevels)

      const initialAutoLevel = getHighestLevelIndex(qualityLevels)
      if (initialAutoLevel !== undefined) {
        const initialBandwidthEstimate = getInitialBandwidthEstimate(
          qualityLevels,
          initialAutoLevel
        )
        if (initialBandwidthEstimate !== undefined) {
          hls.bandwidthEstimate = initialBandwidthEstimate
        }
        hls.startLevel = initialAutoLevel
        hls.nextAutoLevel = initialAutoLevel
      }

      const lowestLevel = getLowestLevel(qualityLevels)
      if (qualityLevels.length > 1 && lowestLevel?.bitrate) {
        // This is intentionally temporary: it avoids an immediate startup drop
        // caused by hls.js' default ABR estimate, but it must not block 360p
        // once real fragment/buffer data or buffer pressure exists.
        hls.config.minAutoBitrate = lowestLevel.bitrate + 1
        startupAutoFloorActive = true
        startupAutoFloorTimer = window.setTimeout(() => {
          releaseStartupAutoFloor('startup timer')
        }, 8000)
      }

      logAutoState('manifest parsed', {
        selectedInitialAutoLevel: initialAutoLevel,
        selectedInitialBandwidthEstimate:
          initialAutoLevel === undefined
            ? undefined
            : getInitialBandwidthEstimate(qualityLevels, initialAutoLevel),
        temporaryStartupFloor: startupAutoFloorActive
          ? {
              excludedLevel: lowestLevel?.index,
              excludedLabel: lowestLevel?.label,
              minAutoBitrateBps: hls.config.minAutoBitrate,
            }
          : null,
        parsedLevels: qualityLevels,
        firstLevelFromManifest: data.firstLevel,
        audioTracks: data.audioTracks?.length ?? 0,
      })
      hls.startLoad(-1)

      // Autoplay when manifest is ready
      video.play().catch(() => {
        // Autoplay blocked by browser - expected behavior
      })
    })

    hls.on(Hls.Events.LEVEL_SWITCHING, (_event, data) => {
      logAutoState('level switching', {
        level: data.level,
        attrs: data.attrs,
        bitrate: formatBitrate(data.bitrate),
        height: data.height,
        width: data.width,
      })
    })

    hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
      setHlsActiveLevel(data.level)
      logAutoState('level switched', { level: data.level })
    })

    hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
      logAutoState('level loaded', {
        level: data.level,
        targetduration: data.details?.targetduration,
        fragments: data.details?.fragments?.length,
        totalduration: data.details?.totalduration,
        live: data.details?.live,
      })
    })

    hls.on(Hls.Events.FRAG_LOADED, (_event, data) => {
      logAutoState('fragment loaded', {
        level: data.frag.level,
        sn: data.frag.sn,
        type: data.frag.type,
        url: data.frag.url,
        payloadBytes: data.payload?.byteLength,
        fragmentBitrate: formatBitrate(data.frag.bitrate ?? undefined),
        byteLength: data.frag.byteLength,
        bwEstimate: formatBitrate(hls.bandwidthEstimate),
      })
    })

    hls.on(Hls.Events.FRAG_BUFFERED, (_event, data) => {
      logAutoState('fragment buffered', {
        level: data.frag.level,
        sn: data.frag.sn,
        type: data.frag.type,
        bitrateTest: data.frag.bitrateTest,
        statsLoadedBytes: data.stats.loaded,
        statsBwEstimate: formatBitrate(data.stats.bwEstimate),
        statsBwEstimateBps: data.stats.bwEstimate,
        statsLoading: data.stats.loading,
        statsParsing: data.stats.parsing,
      })

      if (data.frag.type === 'main') {
        releaseStartupAutoFloor('first main fragment buffered')
      }
    })

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.details?.toString().includes('buffer')) {
        releaseStartupAutoFloor(`hls error: ${data.details}`)
      }
      logAutoState('error', {
        type: data.type,
        details: data.details,
        fatal: data.fatal,
        level: data.context?.level,
        response: data.response,
      })
    })

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.error('HLS network error, trying to recover...')
            hls.startLoad()
            break
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.error('HLS media error, trying to recover...')
            hls.recoverMediaError()
            break
          default:
            console.error('Fatal HLS error:', data)
            setHlsError(`HLS Error: ${data.details}`)
            hls.destroy()
            break
        }
      }
    })

    return () => {
      releaseStartupAutoFloor('cleanup')
      video.removeEventListener('waiting', releaseStartupAutoFloorForBufferPressure)
      video.removeEventListener('stalled', releaseStartupAutoFloorForBufferPressure)
      hls.destroy()
      hlsRef.current = null
    }
  }, [
    videoRef,
    src,
    shouldBeActive,
    blossomServers,
    cachingServers,
    authorPubkey,
    videoId,
    localhostProxyMode,
    ladder,
  ])

  // Set quality level
  const setLevel = useCallback(
    (level: number) => {
      if (hlsRef.current) {
        const hls = hlsRef.current
        const previousLevel = hls.currentLevel
        hls.currentLevel = level
        if (level === -1) {
          const levels = hls.levels?.map((hlsLevel, index) => ({
            index,
            height: hlsLevel.height,
            width: hlsLevel.width,
            bitrate: hlsLevel.bitrate,
            label: hlsLevel.height
              ? `${hlsLevel.height}p`
              : `${Math.round(hlsLevel.bitrate / 1000)}kbps`,
          }))
          const highestLevel = levels ? getHighestLevelIndex(levels) : undefined
          if (highestLevel !== undefined) {
            const initialBandwidthEstimate = getInitialBandwidthEstimate(levels, highestLevel)
            if (initialBandwidthEstimate !== undefined) {
              hls.bandwidthEstimate = initialBandwidthEstimate
            }
            hls.nextAutoLevel = highestLevel
          }
        }
        if (isHlsDebugEnabled()) {
          console.info('[HLS]', 'quality selection changed', {
            previousLevel,
            selectedLevel: level,
            activeLevel: hlsActiveLevel,
            autoLevelEnabled: hls.autoLevelEnabled,
            currentLevel: hls.currentLevel,
            nextAutoLevel: hls.nextAutoLevel,
            bandwidthEstimate: formatBitrate(hls.bandwidthEstimate),
          })
          logHlsJson('quality selection changed', {
            previousLevel,
            selectedLevel: level,
            activeLevel: hlsActiveLevel,
            autoLevelEnabled: hls.autoLevelEnabled,
            currentLevel: hls.currentLevel,
            nextAutoLevel: hls.nextAutoLevel,
            bandwidthEstimate: formatBitrate(hls.bandwidthEstimate),
            bandwidthEstimateBps: Number.isNaN(hls.bandwidthEstimate)
              ? null
              : hls.bandwidthEstimate,
          })
        }
        setHlsCurrentLevel(level)
      }
    },
    [hlsActiveLevel]
  )

  return {
    levels,
    currentLevel,
    activeLevel,
    setLevel,
    isLoading,
    error,
  }
}
