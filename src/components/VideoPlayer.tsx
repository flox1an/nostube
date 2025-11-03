import * as React from 'react'
import { useRef, useEffect, useCallback, useState } from 'react'
import 'media-chrome'
import 'hls-video-element'
import { TextTrack } from '@/utils/video-event'
import { getLanguageLabel, imageProxyVideoPreview } from '@/lib/utils'
import 'media-chrome/menu'
import '@/types/media-chrome.d.ts'
import { Loader2 } from 'lucide-react'
import { extractBlossomHash } from '@/utils/video-event'
import { useAppContext } from '@/hooks/useAppContext'
import type { BlossomServer } from '@/contexts/AppContext'

/**
 * Generate alternative URLs for VTT tracks using Blossom proxy servers
 */
function generateVttProxyUrls(originalUrl: string, proxyServers: BlossomServer[]): string[] {
  if (proxyServers.length === 0) return []

  const { sha256, ext } = extractBlossomHash(originalUrl)

  if (!sha256 || !ext) return []

  const proxyUrls: string[] = []

  // Extract protocol + hostname from original URL
  let originBase = ''
  try {
    const urlObj = new URL(originalUrl)
    originBase = `${urlObj.protocol}//${urlObj.hostname}`
  } catch {
    return []
  }

  // Generate proxy URLs for each proxy server
  for (const proxyServer of proxyServers) {
    const baseUrl = proxyServer.url.replace(/\/$/, '')

    try {
      const proxyUrlObj = new URL(baseUrl)
      const proxyOrigin = `${proxyUrlObj.protocol}//${proxyUrlObj.hostname}`

      // If origin matches proxy, use direct URL
      if (originBase === proxyOrigin) {
        proxyUrls.push(`${baseUrl}/${sha256}.${ext}`)
      } else {
        // Otherwise use proxy URL with origin parameter
        proxyUrls.push(`${baseUrl}/${sha256}.${ext}?origin=${encodeURIComponent(originBase)}`)
      }
    } catch {
      continue
    }
  }

  return proxyUrls
}

interface VideoPlayerProps {
  urls: string[]
  loop?: boolean
  textTracks: TextTrack[]
  mime: string
  poster?: string
  onTimeUpdate?: (time: number) => void
  className?: string
  contentWarning?: string
  /**
   * Initial play position in seconds
   */
  initialPlayPos?: number
  /**
   * Callback when all video sources fail to load
   */
  onAllSourcesFailed?: (urls: string[]) => void
  /**
   * Cinema mode state and toggle
   */
  cinemaMode?: boolean
  onToggleCinemaMode?: () => void
  /**
   * Callback when video dimensions are loaded
   */
  onVideoDimensionsLoaded?: (width: number, height: number) => void
  /**
   * Callback when playback finishes
   */
  onEnded?: () => void
  /**
   * Callback when video element is ready
   */
  onVideoElementReady?: (element: HTMLVideoElement | null) => void
}

export function VideoPlayer({
  urls,
  mime,
  poster,
  textTracks,
  loop = false,
  onTimeUpdate,
  className,
  contentWarning,
  initialPlayPos = 0,
  onAllSourcesFailed,
  cinemaMode = false,
  onToggleCinemaMode,
  onVideoDimensionsLoaded,
  onEnded,
  onVideoElementReady,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hlsEl, setHlsEl] = useState<HTMLVideoElement | null>(null)
  const [currentUrlIndex, setCurrentUrlIndex] = useState(0)
  const [allFailed, setAllFailed] = useState(false)
  const [triedHead, setTriedHead] = useState(false)
  const [showSpinner, setShowSpinner] = useState(false)
  const spinnerTimeoutRef = useRef<number | null>(null)

  // Get blossom servers from context for VTT failover
  const { config } = useAppContext()
  const blossomProxyServers = React.useMemo(
    () => (config.blossomServers || []).filter(server => server.tags.includes('proxy')),
    [config.blossomServers]
  )

  // Track VTT URLs with their alternatives (original URL -> list of alternative URLs to try)
  const [vttUrlMap, setVttUrlMap] = useState<Map<string, string[]>>(new Map())
  const trackRefs = useRef<Map<string, HTMLTrackElement>>(new Map())

  // Track validated VTT URLs (lang -> validated URL to use)
  const [validatedVttUrls, setValidatedVttUrls] = useState<Map<string, string>>(new Map())

  const isHls = React.useMemo(
    () => mime === 'application/vnd.apple.mpegurl' || urls[currentUrlIndex]?.endsWith('.m3u8'),
    [mime, urls, currentUrlIndex]
  )

  useEffect(() => {
    setAllFailed(false)
    setCurrentUrlIndex(0)
    setTriedHead(false)
  }, [urls])

  // Notify parent when video element is ready
  useEffect(() => {
    const el = isHls ? hlsEl : videoRef.current
    if (onVideoElementReady) {
      onVideoElementReady(el)
    }
  }, [isHls, hlsEl, onVideoElementReady])

  // Track if we've already set the initial position
  const hasSetInitialPos = useRef(false)

  // Set initial play position on mount
  useEffect(() => {
    const el = isHls ? hlsEl : videoRef.current
    if (!el || hasSetInitialPos.current) return
    if (initialPlayPos > 0) {
      // Only seek if the difference is significant (e.g., >1s)
      if (Math.abs(el.currentTime - initialPlayPos) > 1) {
        el.currentTime = initialPlayPos
        hasSetInitialPos.current = true
      }
    }
  }, [initialPlayPos, isHls, hlsEl])

  // Reset the flag when URLs change (new video)
  useEffect(() => {
    hasSetInitialPos.current = false
  }, [urls])

  // Detect video dimensions when metadata is loaded
  useEffect(() => {
    const el = isHls ? hlsEl : videoRef.current
    if (!el) return

    const handleLoadedMetadata = () => {
      if (onVideoDimensionsLoaded && el.videoWidth > 0 && el.videoHeight > 0) {
        onVideoDimensionsLoaded(el.videoWidth, el.videoHeight)
      }
    }

    el.addEventListener('loadedmetadata', handleLoadedMetadata)

    // If metadata is already loaded, call immediately
    if (el.readyState >= 1 && el.videoWidth > 0 && el.videoHeight > 0) {
      handleLoadedMetadata()
    }

    return () => {
      el.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [isHls, hlsEl, onVideoDimensionsLoaded])

  // Handle video loading state and spinner display
  useEffect(() => {
    const el = isHls ? hlsEl : videoRef.current
    if (!el) return

    const handleLoadStart = () => {
      // Start timer to show spinner after 200ms
      if (spinnerTimeoutRef.current !== null) {
        clearTimeout(spinnerTimeoutRef.current)
      }
      spinnerTimeoutRef.current = window.setTimeout(() => {
        setShowSpinner(true)
      }, 200)
    }

    const handleWaiting = () => {
      if (spinnerTimeoutRef.current !== null) {
        clearTimeout(spinnerTimeoutRef.current)
      }
      spinnerTimeoutRef.current = window.setTimeout(() => {
        setShowSpinner(true)
      }, 200)
    }

    const handleCanPlay = () => {
      setShowSpinner(false)
      if (spinnerTimeoutRef.current !== null) {
        clearTimeout(spinnerTimeoutRef.current)
        spinnerTimeoutRef.current = null
      }
    }

    const handlePlaying = () => {
      setShowSpinner(false)
      if (spinnerTimeoutRef.current !== null) {
        clearTimeout(spinnerTimeoutRef.current)
        spinnerTimeoutRef.current = null
      }
    }

    el.addEventListener('loadstart', handleLoadStart)
    el.addEventListener('waiting', handleWaiting)
    el.addEventListener('canplay', handleCanPlay)
    el.addEventListener('playing', handlePlaying)

    return () => {
      el.removeEventListener('loadstart', handleLoadStart)
      el.removeEventListener('waiting', handleWaiting)
      el.removeEventListener('canplay', handleCanPlay)
      el.removeEventListener('playing', handlePlaying)
      if (spinnerTimeoutRef.current !== null) {
        clearTimeout(spinnerTimeoutRef.current)
      }
    }
  }, [isHls, hlsEl])

  // Ref callback for hls-video custom element
  const hlsRef = useCallback((node: Element | null) => {
    setHlsEl(node && 'currentTime' in node ? (node as HTMLVideoElement) : null)
  }, [])

  const handleTimeUpdate = useCallback(() => {
    const el = isHls ? hlsEl : videoRef.current
    if (onTimeUpdate && el) {
      onTimeUpdate(el.currentTime)
    }
  }, [onTimeUpdate, isHls, hlsEl])
  const handleEndedEvent = useCallback(() => {
    if (onEnded) {
      onEnded()
    }
  }, [onEnded])

  // Handle error: on first error, do HEAD requests for all remaining URLs to find a working one
  const handleVideoError = useCallback(async () => {
    if (!triedHead && urls.length > 1 && currentUrlIndex < urls.length - 1) {
      setTriedHead(true)
      // Try HEAD requests for all remaining URLs in parallel
      const remaining = urls.slice(currentUrlIndex + 1)
      const checks = await Promise.all(
        remaining.map(async url => {
          try {
            const res = await fetch(url, { method: 'HEAD', mode: 'cors' })
            return res.ok
          } catch {
            return false
          }
        })
      )
      const foundIdx = checks.findIndex(ok => ok)
      if (foundIdx !== -1) {
        setCurrentUrlIndex(currentUrlIndex + 1 + foundIdx)
        setAllFailed(false)
        return
      } else {
        setAllFailed(true)
        // Notify parent that all sources failed
        if (onAllSourcesFailed) {
          onAllSourcesFailed(urls)
        }
        return
      }
    }
    if (currentUrlIndex < urls.length - 1) {
      setCurrentUrlIndex(i => i + 1)
    } else {
      setAllFailed(true)
      // Notify parent that all sources failed
      if (onAllSourcesFailed) {
        onAllSourcesFailed(urls)
      }
    }
  }, [currentUrlIndex, urls, triedHead, onAllSourcesFailed])

  // Reset triedHead if currentUrlIndex changes (new error sequence)
  useEffect(() => {
    setTriedHead(false)
  }, [currentUrlIndex])

  // Initialize VTT URL map with failover alternatives when textTracks or proxy servers change
  useEffect(() => {
    const newMap = new Map<string, string[]>()

    textTracks.forEach(track => {
      // Generate alternative URLs using Blossom proxy servers
      const alternatives = generateVttProxyUrls(track.url, blossomProxyServers)
      newMap.set(track.url, alternatives)
    })

    setVttUrlMap(newMap)
  }, [textTracks, blossomProxyServers])

  // Proactively validate VTT URLs on mount to avoid 90-second hangs
  useEffect(() => {
    if (textTracks.length === 0) return

    const validateUrls = async () => {
      const timeout = 5000 // 5 second timeout
      const validated = new Map<string, string>()

      await Promise.all(
        textTracks.map(async track => {
          // Test original URL first
          const urlsToTest = [track.url, ...generateVttProxyUrls(track.url, blossomProxyServers)]

          for (const url of urlsToTest) {
            try {
              const controller = new AbortController()
              const timeoutId = setTimeout(() => controller.abort(), timeout)

              const res = await fetch(url, {
                method: 'HEAD',
                mode: 'cors',
                signal: controller.signal,
              })

              clearTimeout(timeoutId)

              if (res.ok) {
                validated.set(track.lang, url)
                console.log(`VTT track validated for ${track.lang}: ${url}`)
                break // Found working URL
              }
            } catch {
              // Try next URL
              continue
            }
          }

          // If no URL worked, still use original (might work later or has CORS issues with HEAD)
          if (!validated.has(track.lang)) {
            validated.set(track.lang, track.url)
            console.warn(`VTT track validation failed for ${track.lang}, using original: ${track.url}`)
          }
        })
      )

      setValidatedVttUrls(validated)
    }

    validateUrls()
  }, [textTracks, blossomProxyServers])

  // Handle VTT track load error and try failover URLs
  const handleTrackError = useCallback(
    async (originalUrl: string, lang: string) => {
      const alternatives = vttUrlMap.get(originalUrl)

      if (!alternatives || alternatives.length === 0) {
        console.warn(`VTT track failed to load and no alternatives available: ${originalUrl}`)
        return
      }

      // Get the track element
      const trackElement = trackRefs.current.get(lang)
      if (!trackElement) return

      console.log(`VTT track failed for ${lang}, testing ${alternatives.length} alternatives...`)

      // Test all alternatives in parallel with timeout
      const timeout = 5000 // 5 second timeout
      const checks = await Promise.all(
        alternatives.map(async url => {
          try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), timeout)

            const res = await fetch(url, {
              method: 'HEAD',
              mode: 'cors',
              signal: controller.signal,
            })

            clearTimeout(timeoutId)
            return { url, ok: res.ok }
          } catch (err) {
            // Timeout or network error
            return { url, ok: false }
          }
        })
      )

      // Find first working URL
      const working = checks.find(check => check.ok)

      if (working) {
        console.log(`VTT track using alternative for ${lang}: ${working.url}`)
        trackElement.src = working.url
        // Clear alternatives since we found one that works
        setVttUrlMap(prev => {
          const newMap = new Map(prev)
          newMap.set(originalUrl, [])
          return newMap
        })
      } else {
        console.warn(`All VTT track alternatives failed for ${lang}`)
        // Clear alternatives since none work
        setVttUrlMap(prev => {
          const newMap = new Map(prev)
          newMap.set(originalUrl, [])
          return newMap
        })
      }
    },
    [vttUrlMap]
  )

  const hasCaptions = textTracks.length > 0

  const posterUrl = React.useMemo(
    () => (poster !== undefined ? imageProxyVideoPreview(poster) : undefined),
    [poster]
  )

  useEffect(() => {
    if (!onEnded) return
    const el = isHls ? hlsEl : videoRef.current
    if (!el) return
    el.addEventListener('ended', handleEndedEvent)
    return () => {
      el.removeEventListener('ended', handleEndedEvent)
    }
  }, [onEnded, isHls, hlsEl, handleEndedEvent])

  return (
    <media-controller className={className}>
      {allFailed ? (
        <div className="flex items-center justify-center h-64 text-red-600 font-semibold">
          Failed to load video from all sources.
        </div>
      ) : isHls ? (
        <hls-video
          src={urls[currentUrlIndex]}
          slot="media"
          className={cinemaMode ? 'cinema' : 'normal'}
          autoPlay={!contentWarning}
          loop={loop}
          poster={posterUrl}
          crossOrigin="anonymous"
          onTimeUpdate={handleTimeUpdate}
          ref={hlsRef}
          tabIndex={0}
          onError={handleVideoError}
        ></hls-video>
      ) : (
        <video
          crossOrigin="anonymous"
          src={urls[currentUrlIndex]}
          ref={videoRef}
          className={cinemaMode ? 'cinema' : 'normal'}
          slot="media"
          autoPlay={!contentWarning}
          loop={loop}
          poster={posterUrl}
          onTimeUpdate={handleTimeUpdate}
          tabIndex={0}
          onError={handleVideoError}
        >
          {/* TODO translate label */}
          {textTracks.map(vtt => {
            // Use validated URL if available, otherwise use original
            const trackUrl = validatedVttUrls.get(vtt.lang) || vtt.url
            return (
              <track
                key={vtt.lang}
                label={getLanguageLabel(vtt.lang)}
                kind="captions"
                srcLang={vtt.lang}
                src={trackUrl}
                ref={el => {
                  if (el) {
                    trackRefs.current.set(vtt.lang, el)
                  }
                }}
                onError={() => handleTrackError(vtt.url, vtt.lang)}
              ></track>
            )
          })}
          {/* TODO: add captions <track kind="captions" /> */}
          {/* TODO: add fallback sources <source src={url} type={mime} /> */}
        </video>
      )}

      {/* Loading spinner overlay */}
      {showSpinner && !allFailed && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none z-10">
          <Loader2 className="h-32 w-32 animate-spin text-white text-8xl" />
        </div>
      )}

      {hasCaptions && <media-captions-menu hidden anchor="auto"></media-captions-menu>}

      <media-control-bar>
        <media-play-button />
        <media-mute-button />
        <media-volume-range />
        <media-time-display />
        <media-time-range />
        <media-playback-rate-button></media-playback-rate-button>
        <media-pip-button />
        {hasCaptions && <media-captions-menu-button></media-captions-menu-button>}
        {onToggleCinemaMode && (
          <button
            className="media-button"
            aria-label={cinemaMode ? 'Exit cinema mode' : 'Enter cinema mode'}
            onClick={onToggleCinemaMode}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {cinemaMode ? (
                // Exit cinema mode - smaller 16:9 rectangle (normal view)
                <rect x="1" y="6" width="22" height="12" rx="1" />
              ) : (
                // Enter cinema mode - full-width 16:9 rectangle (cinema view)
                <rect x="1" y="4.5" width="22" height="15" rx="1" />
              )}
            </svg>
          </button>
        )}
        <media-fullscreen-button />
      </media-control-bar>
    </media-controller>
  )
}
