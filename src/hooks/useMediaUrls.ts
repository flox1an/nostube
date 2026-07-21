import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { MediaUrlOptions, MediaType } from '@/lib/media-url-generator'
import { PlaybackUrlLadder, type PlaybackUrlLadderOptions } from '@/lib/playback-url-ladder'
import { discoverUrlsWithCache } from '@/lib/url-discovery'
import { validateMediaUrl, type ValidationOptions } from '@/lib/url-validator'
import { isAllowedEventMediaUrl } from '@/lib/media-url-policy'
import { useAppContextSafe } from '@/hooks/useAppContext'
import { INDEXER_RELAYS } from '@/constants/relays'

export interface UseMediaUrlsOptions extends Omit<MediaUrlOptions, 'blossomServers'> {
  enabled?: boolean
  discoveryEnabled?: boolean
  discoveryRelays?: string[]
  discoveryTimeout?: number
  preValidate?: boolean
  validationOptions?: ValidationOptions
  onError?: (error: Error) => void
}

export interface MediaUrlsResult {
  ladder: PlaybackUrlLadder
  urls: string[]
  isLoading: boolean
  isDiscovering: boolean
  error: Error | null
  currentIndex: number
  currentUrl: string | null
  moveToNext: () => void
  reset: () => void
  hasMore: boolean
}

/**
 * React binding for a single Video Event's playback URL ladder.
 *
 * URL generation, discovery, validation, and failover all mutate the same
 * plain ladder instance. Consumers that need the underlying playback policy
 * (notably the HLS loader) receive that instance from the result.
 */
export function useMediaUrls(options: UseMediaUrlsOptions): MediaUrlsResult {
  const {
    urls,
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
  const appContext = useAppContextSafe()
  const config = appContext?.config
  const blossomServers = useMemo(
    () => config?.blossomServers ?? [],
    [config?.blossomServers]
  )
  const cachingServers = useMemo(
    () => config?.cachingServers ?? [],
    [config?.cachingServers]
  )
  const mediaConfig = config?.media
  const [error, setError] = useState<Error | null>(null)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [, update] = useReducer(version => version + 1, 0)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const sourceKey = useMemo(
    () =>
      [enabled, mediaType, sha256 ?? '', kind ?? '', authorPubkey ?? '', ...urls].join('\u0000'),
    [authorPubkey, enabled, kind, mediaType, sha256, urls]
  )
  const ladderOptions = useMemo<PlaybackUrlLadderOptions>(
    () => ({
      urls: enabled ? urls : [],
      blossomServers,
      cachingServers,
      sha256,
      kind,
      mediaType,
      authorPubkey,
      proxyConfig,
    }),
    [authorPubkey, blossomServers, cachingServers, enabled, kind, mediaType, proxyConfig, sha256, urls]
  )
  const ladderConfigKey = useMemo(
    () =>
      [
        sourceKey,
        proxyConfig?.enabled,
        proxyConfig?.maxSize?.width ?? '',
        proxyConfig?.maxSize?.height ?? '',
        ...blossomServers.map(server => `${server.url}:${server.tags.join(',')}`),
        ...cachingServers.map(server => server.url),
      ].join('\u0000'),
    [blossomServers, cachingServers, proxyConfig, sourceKey]
  )
  const ladderRef = useRef<{ sourceKey: string; ladder: PlaybackUrlLadder } | null>(null)

  if (ladderRef.current?.sourceKey !== sourceKey) {
    ladderRef.current = {
      sourceKey,
      ladder: new PlaybackUrlLadder(ladderOptions),
    }
  }

  const ladder = ladderRef.current.ladder
  const ladderOptionsRef = useRef(ladderOptions)
  ladderOptionsRef.current = ladderOptions
  const finalDiscoveryEnabled = discoveryEnabled ?? mediaConfig?.failover.discovery.enabled ?? Boolean(sha256)
  const finalDiscoveryRelays = useMemo(
    () => [...new Set([...(discoveryRelays ?? config?.relays.map(relay => relay.url) ?? []), ...INDEXER_RELAYS])],
    [config?.relays, discoveryRelays]
  )
  const finalDiscoveryTimeout =
    discoveryTimeout ?? mediaConfig?.failover.discovery.timeout ?? 10_000
  const finalPreValidate = preValidate ?? mediaConfig?.failover.validation.enabled ?? false
  const finalValidationOptions = useMemo(
    () => validationOptions ?? { timeout: mediaConfig?.failover.validation.timeout ?? 5_000 },
    [mediaConfig?.failover.validation.timeout, validationOptions]
  )
  const ladderUrlsKey = ladder.urls.join('\u0000')

  useEffect(() => {
    if (ladder.refresh(ladderOptionsRef.current)) update()
  }, [ladder, ladderConfigKey])

  useEffect(() => {
    if (!enabled || !finalDiscoveryEnabled || !sha256 || finalDiscoveryRelays.length === 0) return

    let cancelled = false
    setIsDiscovering(true)

    void discoverUrlsWithCache({
      sha256,
      relays: finalDiscoveryRelays,
      timeout: finalDiscoveryTimeout,
      maxResults: 20,
    })
      .then(discovered => {
        if (cancelled) return
        const discoveredUrls = discovered.map(result => result.url).filter(isAllowedEventMediaUrl)
        if (ladder.merge(discoveredUrls)) update()
      })
      .catch(discoveryError => {
        if (cancelled) return
        const nextError =
          discoveryError instanceof Error ? discoveryError : new Error('URL discovery failed')
        setError(nextError)
        onErrorRef.current?.(nextError)
      })
      .finally(() => {
        if (!cancelled) setIsDiscovering(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled, finalDiscoveryEnabled, finalDiscoveryRelays, finalDiscoveryTimeout, ladder, sha256])

  useEffect(() => {
    if (!enabled || !finalPreValidate || ladder.urls.length === 0) return

    let cancelled = false
    const candidates = ladder.urls.slice(0, 5)

    void Promise.all(
      candidates.map(async url => ({
        url,
        isValid: await validateMediaUrl(url, finalValidationOptions).catch(() => false),
      }))
    ).then(results => {
      if (cancelled) return
      const validUrls = results.filter(result => result.isValid).map(result => result.url)
      if (validUrls.length === 0) return
      ladder.promote(validUrls)
      update()
    })

    return () => {
      cancelled = true
    }
  }, [enabled, finalPreValidate, finalValidationOptions, ladder, ladderUrlsKey])

  const moveToNext = useCallback(() => {
    if (ladder.tryNext()) update()
  }, [ladder])
  const reset = useCallback(() => {
    ladder.reset()
    update()
  }, [ladder])

  return {
    ladder,
    urls: ladder.urls,
    isLoading: false,
    isDiscovering,
    error,
    currentIndex: ladder.currentIndex,
    currentUrl: ladder.currentUrl,
    moveToNext,
    reset,
    hasMore: ladder.hasMore,
  }
}

export function useMediaUrlsWithAutoRetry(options: UseMediaUrlsOptions) {
  const result = useMediaUrls(options)
  const onErrorRef = useRef(options.onError)
  onErrorRef.current = options.onError

  const handleError = useCallback(() => {
    if (result.hasMore) {
      result.moveToNext()
      return
    }
    onErrorRef.current?.(new Error('All media URLs failed'))
  }, [result])

  return { ...result, handleError }
}

export type { MediaType }
