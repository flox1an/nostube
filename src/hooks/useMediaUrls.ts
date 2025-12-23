/**
 * useMediaUrls Hook
 *
 * React integration for media URL failover system.
 * Provides automatic URL discovery and failover for any media type.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  generateMediaUrls,
  type MediaUrlOptions,
  type GeneratedUrls,
} from '@/lib/media-url-generator'
import { discoverUrlsWithCache, type DiscoveryOptions } from '@/lib/url-discovery'
import { validateMediaUrl, type ValidationOptions } from '@/lib/url-validator'
import { useAppContextSafe } from '@/hooks/useAppContext'

export interface UseMediaUrlsOptions extends Omit<MediaUrlOptions, 'blossomServers'> {
  enabled?: boolean // Enable auto-discovery (default: true)
  discoveryEnabled?: boolean // Enable relay discovery (default: false)
  discoveryRelays?: string[] // Relays for discovery
  discoveryTimeout?: number // Discovery timeout (default: 10s)
  preValidate?: boolean // Pre-validate URLs before returning (default: false)
  validationOptions?: ValidationOptions // Validation options
  authorPubkey?: string // Author pubkey (npub or hex) for AS query parameter
  onError?: (error: Error) => void
}

export interface MediaUrlsResult {
  urls: string[] // All available URLs
  isLoading: boolean
  isDiscovering: boolean // Currently discovering URLs
  error: Error | null
  currentIndex: number // Which URL is active
  currentUrl: string | null // Current active URL
  moveToNext: () => void // Try next URL
  reset: () => void // Start over
  hasMore: boolean // Are there more URLs to try?
}

/**
 * Hook for managing media URLs with automatic failover and discovery
 *
 * Usage:
 * ```tsx
 * const { urls, currentUrl, moveToNext, isLoading } = useMediaUrls({
 *   urls: videoUrls,
 *   mediaType: 'video',
 *   sha256: videoHash,
 *   discoveryEnabled: true,
 *   discoveryRelays: relays,
 * })
 * ```
 */
export function useMediaUrls(options: UseMediaUrlsOptions): MediaUrlsResult {
  const {
    urls: originalUrls,
    mediaType,
    sha256,
    kind,
    proxyConfig,
    authorPubkey,
    enabled = true,
    discoveryEnabled,
    discoveryRelays,
    discoveryTimeout,
    preValidate,
    validationOptions,
    onError,
  } = options

  // Get configuration from AppContext (may be undefined in embed context)
  const appContext = useAppContextSafe()
  const config = appContext?.config

  // Store onError in ref to avoid it as a dependency
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  // Memoize blossomServers to prevent unnecessary re-renders
  const blossomServers = useMemo(() => config?.blossomServers || [], [config?.blossomServers])

  // Memoize cachingServers to prevent unnecessary re-renders
  const cachingServers = useMemo(() => config?.cachingServers || [], [config?.cachingServers])

  // Use media config from context if not provided in options
  const mediaConfig = config?.media

  // Memoize all computed config values to prevent unnecessary re-renders
  const finalDiscoveryEnabled = useMemo(
    () => discoveryEnabled ?? mediaConfig?.failover.discovery.enabled ?? false,
    [discoveryEnabled, mediaConfig?.failover.discovery.enabled]
  )

  const finalDiscoveryRelays = useMemo(
    () => discoveryRelays ?? config?.relays.map(r => r.url) ?? [],
    [discoveryRelays, config?.relays]
  )

  const finalDiscoveryTimeout = useMemo(
    () => discoveryTimeout ?? mediaConfig?.failover.discovery.timeout ?? 10000,
    [discoveryTimeout, mediaConfig?.failover.discovery.timeout]
  )

  const finalPreValidate = useMemo(
    () => preValidate ?? mediaConfig?.failover.validation.enabled ?? false,
    [preValidate, mediaConfig?.failover.validation.enabled]
  )

  const finalValidationOptions = useMemo(
    () =>
      validationOptions ?? {
        timeout: mediaConfig?.failover.validation.timeout ?? 5000,
      },
    [validationOptions, mediaConfig?.failover.validation.timeout]
  )

  const [generatedUrls, setGeneratedUrls] = useState<GeneratedUrls>({
    urls: [],
    metadata: [],
  })
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Serialize URL arrays for stable comparison
  const originalUrlsKey = useMemo(() => originalUrls.join('|'), [originalUrls])
  const blossomServersKey = useMemo(
    () => blossomServers.map(s => s.url).join('|'),
    [blossomServers]
  )
  const cachingServersKey = useMemo(
    () => cachingServers.map(s => s.url).join('|'),
    [cachingServers]
  )

  // Generate URLs from original URLs + mirrors + proxies
  useEffect(() => {
    if (!enabled || originalUrls.length === 0) {
      setIsLoading(false)
      return
    }

    try {
      const generated = generateMediaUrls({
        urls: originalUrls,
        blossomServers,
        cachingServers,
        sha256,
        kind,
        mediaType,
        proxyConfig,
        authorPubkey,
      })

      setGeneratedUrls(generated)
      setCurrentIndex(0)
      setIsLoading(false)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to generate URLs')
      setError(error)
      setIsLoading(false)
      onErrorRef.current?.(error)
    }
  }, [
    originalUrlsKey,
    mediaType,
    sha256,
    kind,
    proxyConfig,
    authorPubkey,
    enabled,
    blossomServersKey,
    cachingServersKey,
  ])

  // Serialize discovery relays for stable comparison
  const discoveryRelaysKey = useMemo(() => finalDiscoveryRelays.join('|'), [finalDiscoveryRelays])

  // Discover alternative URLs if enabled
  useEffect(() => {
    if (!enabled || !finalDiscoveryEnabled || !sha256 || finalDiscoveryRelays.length === 0) {
      return
    }

    let cancelled = false

    const discover = async () => {
      setIsDiscovering(true)

      try {
        const discoveryOptions: DiscoveryOptions = {
          sha256,
          relays: finalDiscoveryRelays,
          timeout: finalDiscoveryTimeout,
          maxResults: 20,
        }

        const discovered = await discoverUrlsWithCache(discoveryOptions)

        if (cancelled) return

        // Add discovered URLs to the end of the list
        if (discovered.length > 0) {
          const discoveredUrls = discovered.map(d => d.url)

          setGeneratedUrls(prev => {
            // Filter out duplicates
            const existingUrls = new Set(prev.urls)
            const newUrls = discoveredUrls.filter(url => !existingUrls.has(url))

            if (newUrls.length === 0) return prev

            return {
              urls: [...prev.urls, ...newUrls],
              metadata: [
                ...prev.metadata,
                ...newUrls.map(() => ({ source: 'discovered' as const })),
              ],
            }
          })

          if (import.meta.env.DEV) {
            console.log(`Discovered ${discovered.length} alternative URLs for ${mediaType}`)
          }
        }
      } catch (err) {
        if (cancelled) return

        const error = err instanceof Error ? err : new Error('URL discovery failed')
        console.error('URL discovery error:', error)
        // Don't set error state for discovery failures - just log them
      } finally {
        if (!cancelled) {
          setIsDiscovering(false)
        }
      }
    }

    discover()

    return () => {
      cancelled = true
    }
  }, [enabled, finalDiscoveryEnabled, sha256, discoveryRelaysKey, finalDiscoveryTimeout, mediaType])

  // Serialize generated URLs for stable comparison
  const generatedUrlsKey = useMemo(() => generatedUrls.urls.join('|'), [generatedUrls.urls])

  // Pre-validate URLs if enabled
  useEffect(() => {
    if (!enabled || !finalPreValidate || generatedUrls.urls.length === 0) {
      return
    }

    let cancelled = false

    const validate = async () => {
      const validUrls: string[] = []

      // Validate up to first 5 URLs
      const urlsToValidate = generatedUrls.urls.slice(0, 5)

      for (const url of urlsToValidate) {
        if (cancelled) break

        try {
          const isValid = await validateMediaUrl(url, finalValidationOptions)
          if (isValid) {
            validUrls.push(url)
          }
        } catch (err) {
          console.debug(`Pre-validation failed for ${url}:`, err)
        }
      }

      if (cancelled) return

      // If we found valid URLs, reorder to put them first
      if (validUrls.length > 0) {
        setGeneratedUrls(prev => {
          const validSet = new Set(validUrls)
          const otherUrls = prev.urls.filter(url => !validSet.has(url))

          return {
            urls: [...validUrls, ...otherUrls],
            metadata: prev.metadata, // Keep original metadata order
          }
        })

        if (import.meta.env.DEV) {
          console.log(`Pre-validated ${validUrls.length} URLs for ${mediaType}`)
        }
      }
    }

    validate()

    return () => {
      cancelled = true
    }
  }, [enabled, finalPreValidate, generatedUrlsKey, mediaType, finalValidationOptions])

  // Move to next URL
  const moveToNext = useCallback(() => {
    setCurrentIndex(prev => {
      if (prev < generatedUrls.urls.length - 1) {
        return prev + 1
      }
      return prev
    })
  }, [generatedUrls.urls.length])

  // Reset to first URL
  const reset = useCallback(() => {
    setCurrentIndex(0)
    setError(null)
  }, [])

  const currentUrl = generatedUrls.urls[currentIndex] || null
  const hasMore = currentIndex < generatedUrls.urls.length - 1

  return {
    urls: generatedUrls.urls,
    isLoading,
    isDiscovering,
    error,
    currentIndex,
    currentUrl,
    moveToNext,
    reset,
    hasMore,
  }
}

/**
 * Hook variant that automatically tries next URL on error
 *
 * Usage:
 * ```tsx
 * const { currentUrl, handleError } = useMediaUrlsWithAutoRetry({
 *   urls: videoUrls,
 *   mediaType: 'video',
 * })
 *
 * <video
 *   src={currentUrl}
 *   onError={handleError}
 * />
 * ```
 */
export function useMediaUrlsWithAutoRetry(options: UseMediaUrlsOptions) {
  const result = useMediaUrls(options)
  const { moveToNext, hasMore, currentIndex, urls } = result

  // Store onError in ref to avoid it as a dependency
  const onErrorRef = useRef(options.onError)
  useEffect(() => {
    onErrorRef.current = options.onError
  }, [options.onError])

  const handleError = useCallback(() => {
    if (hasMore) {
      if (import.meta.env.DEV) {
        console.log(`Auto-retrying with next URL (${currentIndex + 1}/${urls.length})`)
      }
      moveToNext()
    } else {
      console.warn('All URLs failed, no more alternatives available')
      onErrorRef.current?.(new Error('All media URLs failed'))
    }
  }, [hasMore, moveToNext, currentIndex, urls.length])

  return {
    ...result,
    handleError,
  }
}
