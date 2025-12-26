import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { type TextTrack } from '@/utils/video-event'
import { findValidUrl } from '@/lib/url-validator'
import { useAppContextSafe } from '@/hooks/useAppContext'

interface ValidatedTextTrack extends TextTrack {
  validatedUrl: string
}

interface UseValidatedTextTracksResult {
  validatedTracks: ValidatedTextTrack[]
  isValidating: boolean
}

/**
 * Hook to validate text track URLs and find working alternatives via blossom fallback.
 * Returns only tracks with valid URLs.
 */
export function useValidatedTextTracks(textTracks: TextTrack[]): UseValidatedTextTracksResult {
  const [validatedTracks, setValidatedTracks] = useState<ValidatedTextTrack[]>([])
  const [isValidating, setIsValidating] = useState(false)

  // Get blossom servers from config
  const appContext = useAppContextSafe()
  const blossomServers = useMemo(
    () => appContext?.config?.blossomServers?.map(s => s.url) || [],
    [appContext?.config?.blossomServers]
  )

  // Serialize for stable comparison
  const tracksKey = useMemo(() => textTracks.map(t => `${t.lang}:${t.url}`).join('|'), [textTracks])

  // Store in refs for async access
  const textTracksRef = useRef(textTracks)
  const blossomServersRef = useRef(blossomServers)
  useEffect(() => {
    textTracksRef.current = textTracks
    blossomServersRef.current = blossomServers
  }, [textTracks, blossomServers])

  // Validation function
  const validateTracks = useCallback(async (signal: AbortSignal) => {
    const tracks = textTracksRef.current
    const servers = blossomServersRef.current

    // Validate tracks in parallel
    const results = await Promise.all(
      tracks.map(async track => {
        if (signal.aborted) return null

        const validUrl = await findValidUrl({
          urls: [track.url],
          blossomServers: servers,
          timeout: 5000,
          cache: true,
          resourceType: 'vtt',
        })

        // findValidUrl returns the first URL as fallback even if invalid
        // We need to check if the URL actually works
        if (validUrl && !signal.aborted) {
          try {
            const response = await fetch(validUrl, {
              method: 'HEAD',
              signal: AbortSignal.timeout(5000),
            })
            if (response.ok) {
              return { ...track, validatedUrl: validUrl }
            }
          } catch {
            // URL not accessible
          }
        }
        return null
      })
    )

    if (signal.aborted) return []

    // Filter out null results (failed validations)
    const validated: ValidatedTextTrack[] = []
    for (const result of results) {
      if (result) {
        validated.push(result)
      }
    }

    if (import.meta.env.DEV && validated.length < tracks.length) {
      console.log(`Subtitle validation: ${validated.length}/${tracks.length} tracks available`)
    }

    return validated
  }, [])

  useEffect(() => {
    // Skip validation if no tracks
    if (textTracks.length === 0) {
      return
    }

    const controller = new AbortController()

    // Use queueMicrotask to avoid synchronous setState
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      setIsValidating(true)
    })

    validateTracks(controller.signal).then(validated => {
      if (controller.signal.aborted) return
      setValidatedTracks(validated)
      setIsValidating(false)
    })

    return () => {
      controller.abort()
    }
  }, [tracksKey, validateTracks, textTracks.length])

  // Return empty array if no tracks (derived state instead of setting in effect)
  const effectiveTracks = textTracks.length === 0 ? [] : validatedTracks

  return { validatedTracks: effectiveTracks, isValidating }
}
