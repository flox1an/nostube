import Hls from 'hls.js'
import type {
  HlsConfig,
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoaderStats,
  NullableNetworkDetails,
} from 'hls.js'
import type { BlossomServer, CachingServer } from '@/contexts/AppContext'
import { extractBlossomHash } from '@/lib/blossom-url'
import { PlaybackUrlLadder } from '@/lib/playback-url-ladder'
import { emitHlsFailoverDebug, isHlsDebugEnabled } from '@/lib/hls-failover-debug'
import { getDefaultVerifiedBlobCache, type VerifiedBlobCache } from '@/lib/p2p/verified-blob-cache'
import { isAllowedEventMediaUrl } from '@/lib/media-url-policy'
import type { P2PBlobMesh } from '@/lib/p2p/p2p-blob-mesh'

interface HlsBlossomLoaderOptions {
  blossomServers: BlossomServer[]
  cachingServers: CachingServer[]
  authorPubkey?: string
  videoId?: string
  masterUrl?: string
  localhostProxyMode?: 'always' | 'master-gated' | 'never'
  p2pHlsBlobCacheEnabled?: boolean
  verifiedBlobCache?: VerifiedBlobCache
  p2pBlobMesh?: P2PBlobMesh
  ladder?: PlaybackUrlLadder
}

function logHlsLoader(message: string, details: Record<string, unknown>) {
  if (!isHlsDebugEnabled()) return
  console.info('[HLS:Loader]', message, details)
  console.info(`[HLS:Loader:JSON] ${message} ${JSON.stringify(details)}`)
}

function getContextType(context: LoaderContext): unknown {
  return (context as { type?: unknown }).type
}

function getFragmentDebug(context: LoaderContext): Record<string, unknown> | undefined {
  const frag = (context as { frag?: { level?: unknown; sn?: unknown; type?: unknown } }).frag
  if (!frag) return undefined

  return {
    level: frag.level,
    sn: frag.sn,
    type: frag.type,
  }
}

function copyTiming<T extends { start: number; end: number }>(target: T, source: T) {
  Object.assign(target, source)
}

function copyLoaderStats(target: LoaderStats, source: LoaderStats) {
  target.aborted = source.aborted
  target.loaded = source.loaded
  target.retry = source.retry
  target.total = source.total
  target.chunkCount = source.chunkCount
  target.bwEstimate = source.bwEstimate
  copyTiming(target.loading, source.loading)
  copyTiming(target.parsing, source.parsing)
  copyTiming(target.buffering, source.buffering)
}

function isBlockedEventUrl(url: string): boolean {
  return !isAllowedEventMediaUrl(url)
}

function normalizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).href
  } catch {
    return url
  }
}

function getNow() {
  if (typeof performance !== 'undefined') return performance.now()
  return Date.now()
}

function getMimeTypeFromUrl(url: string) {
  const { ext } = extractBlossomHash(url)
  switch (ext?.toLowerCase()) {
    case 'm3u8':
      return 'application/vnd.apple.mpegurl'
    case 'm4s':
      return 'video/iso.segment'
    case 'mp4':
      return 'video/mp4'
    case 'ts':
      return 'video/mp2t'
    case 'vtt':
      return 'text/vtt'
    default:
      return undefined
  }
}

function getMimeTypeFromNetworkDetails(networkDetails: unknown) {
  if (networkDetails instanceof Response) {
    return networkDetails.headers.get('content-type') ?? undefined
  }

  if (typeof XMLHttpRequest !== 'undefined' && networkDetails instanceof XMLHttpRequest) {
    return networkDetails.getResponseHeader('content-type') ?? undefined
  }

  return undefined
}

function responseDataToBytes(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }
  if (typeof data === 'string') return new TextEncoder().encode(data)
  return null
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function createCacheHitStats(baseStats: LoaderStats, bytes: Uint8Array): LoaderStats {
  const now = getNow()
  const stats = baseStats
  stats.aborted = false
  stats.loaded = bytes.byteLength
  stats.total = bytes.byteLength
  stats.chunkCount = 1
  stats.bwEstimate = 0
  stats.loading.start = now
  stats.loading.first = now
  stats.loading.end = now
  stats.parsing.start = now
  stats.parsing.end = now
  stats.buffering.start = now
  stats.buffering.first = now
  stats.buffering.end = now
  return stats
}

export function createBlossomHlsLoader(options: HlsBlossomLoaderOptions) {
  const ladder =
    options.ladder ??
    new PlaybackUrlLadder({
      urls: options.masterUrl ? [options.masterUrl] : [],
      blossomServers: options.blossomServers,
      cachingServers: options.cachingServers,
      mediaType: 'video',
      authorPubkey: options.authorPubkey,
      proxyConfig: { enabled: true },
    })
  const BaseLoader = Hls.DefaultConfig.loader as new (config: HlsConfig) => Loader<LoaderContext>
  let masterServedFromLocalhost: boolean | null = null
  const verifiedBlobCache = options.verifiedBlobCache ?? getDefaultVerifiedBlobCache()

  return class BlossomHlsLoader implements Loader<LoaderContext> {
    private loader: Loader<LoaderContext> | null = null
    private readonly config: HlsConfig
    private destroyed = false
    context: LoaderContext | null = null
    stats: LoaderStats

    constructor(config: HlsConfig) {
      this.config = config
      this.stats = new BaseLoader(config).stats
    }

    destroy() {
      this.destroyed = true
      this.loader?.destroy()
      this.loader = null
    }

    abort() {
      this.loader?.abort()
    }

    getCacheAge(): number | null {
      return this.loader?.getCacheAge?.() ?? null
    }

    getResponseHeader(name: string): string | null {
      return this.loader?.getResponseHeader?.(name) ?? null
    }

    load(
      context: LoaderContext,
      config: LoaderConfiguration,
      callbacks: LoaderCallbacks<LoaderContext>
    ) {
      this.context = context
      const normalizedMasterUrl = normalizeUrl(options.masterUrl)
      const normalizedRequestUrl = normalizeUrl(context.url)
      const isMasterRequest =
        normalizedMasterUrl !== undefined && normalizedMasterUrl === normalizedRequestUrl

      let candidates = ladder.candidatesFor(context.url)
      if (candidates.length === 0) {
        callbacks.onError(
          { code: 410, text: 'All HLS media URL candidates failed' },
          context,
          null,
          this.stats
        )
        return
      }
      const localhostMode = options.localhostProxyMode ?? 'master-gated'
      const candidatesBeforeFiltering = candidates

      if (localhostMode === 'never') {
        candidates = candidates.filter(url => !isBlockedEventUrl(url))
      } else if (
        localhostMode === 'master-gated' &&
        !isMasterRequest &&
        masterServedFromLocalhost === false
      ) {
        candidates = candidates.filter(url => !isBlockedEventUrl(url))
      }

      if (candidates.length === 0) {
        // A local manifest may legitimately refer to a local cache configured by
        // this user. A public manifest must never regain a private URL after
        // filtering its candidates.
        if (masterServedFromLocalhost || isAllowedEventMediaUrl(context.url)) {
          candidates = [context.url]
        } else {
          callbacks.onError(
            { code: 403, text: 'Blocked private HLS media URL' },
            context,
            null,
            this.stats
          )
          return
        }
      }

      const { sha256 } = extractBlossomHash(context.url)

      logHlsLoader('request candidates', {
        videoId: options.videoId,
        requestUrl: context.url,
        contextType: getContextType(context),
        fragment: getFragmentDebug(context),
        isMasterRequest,
        masterUrl: options.masterUrl,
        localhostMode,
        masterServedFromLocalhost,
        beforeFiltering: candidatesBeforeFiltering,
        afterFiltering: candidates,
      })
      let index = 0

      const deliverBytesFromCache = (bytes: Uint8Array, networkDetails: NullableNetworkDetails) => {
        const stats = createCacheHitStats(this.stats, bytes)
        const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        logHlsLoader('cache hit', {
          videoId: options.videoId,
          requestUrl: context.url,
          sha256,
          contextType: getContextType(context),
          fragment: getFragmentDebug(context),
          loadedBytes: stats.loaded,
        })
        callbacks.onSuccess(
          {
            url: context.url,
            data,
            code: 200,
          },
          stats,
          context,
          networkDetails
        )
      }

      const maybeLoadFromVerifiedCache = () => {
        if (!options.p2pHlsBlobCacheEnabled || !sha256 || !verifiedBlobCache.enabled()) {
          return false
        }

        ;(async () => {
          const result = await verifiedBlobCache.get(sha256)
          if (this.destroyed) return
          if (result) {
            deliverBytesFromCache(result.bytes, result.response)
            return
          }

          logHlsLoader('cache miss', {
            videoId: options.videoId,
            requestUrl: context.url,
            sha256,
            contextType: getContextType(context),
            fragment: getFragmentDebug(context),
          })

          const p2pBytes = await options.p2pBlobMesh?.get(sha256)
          if (this.destroyed) return

          if (p2pBytes) {
            const cacheEntry = await verifiedBlobCache.putVerified({
              sha256,
              bytes: p2pBytes,
              mimeType: getMimeTypeFromUrl(context.url),
              videoId: options.videoId,
              variantUrl: context.url,
              source: 'p2p',
            })

            if (this.destroyed) return
            if (cacheEntry) {
              logHlsLoader('p2p hit', {
                videoId: options.videoId,
                requestUrl: context.url,
                sha256,
                loadedBytes: p2pBytes.byteLength,
              })
              deliverBytesFromCache(
                p2pBytes,
                new Response(bytesToArrayBuffer(p2pBytes), {
                  headers: getMimeTypeFromUrl(context.url)
                    ? { 'content-type': getMimeTypeFromUrl(context.url)! }
                    : undefined,
                })
              )
              return
            }
          }

          loadCandidate()
        })().catch(error => {
          logHlsLoader('cache or p2p read failed', {
            videoId: options.videoId,
            requestUrl: context.url,
            sha256,
            error: error instanceof Error ? error.message : String(error),
          })
          loadCandidate()
        })

        return true
      }

      const writeNetworkResponseToCache = (data: unknown, networkDetails: unknown) => {
        if (!options.p2pHlsBlobCacheEnabled || !sha256 || !verifiedBlobCache.enabled()) return

        const bytes = responseDataToBytes(data)
        if (!bytes) return

        verifiedBlobCache
          .putVerified({
            sha256,
            bytes,
            mimeType:
              getMimeTypeFromNetworkDetails(networkDetails) ?? getMimeTypeFromUrl(context.url),
            videoId: options.videoId,
            variantUrl: context.url,
            source: 'blossom',
          })
          .catch(error => {
            logHlsLoader('cache write failed', {
              videoId: options.videoId,
              requestUrl: context.url,
              sha256,
              error: error instanceof Error ? error.message : String(error),
            })
          })
      }

      const loadCandidate = () => {
        if (this.destroyed) return

        const candidateUrl = candidates[index]
        const attempt = index + 1
        logHlsLoader('attempt', {
          videoId: options.videoId,
          requestUrl: context.url,
          candidateUrl,
          attempt,
          totalCandidates: candidates.length,
          contextType: getContextType(context),
          fragment: getFragmentDebug(context),
        })
        emitHlsFailoverDebug({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          timestamp: Date.now(),
          videoId: options.videoId,
          stage: attempt === 1 ? 'request' : 'retry',
          requestUrl: context.url,
          candidateUrl,
          attempt,
          totalCandidates: candidates.length,
        })
        const nextContext = { ...context, url: candidateUrl }
        const loader = new BaseLoader(this.config)
        this.loader = loader
        copyLoaderStats(this.stats, loader.stats)

        loader.load(nextContext, config, {
          ...callbacks,
          onProgress: callbacks.onProgress
            ? (stats, progressContext, data, networkDetails) => {
                copyLoaderStats(this.stats, stats)
                callbacks.onProgress?.(this.stats, progressContext, data, networkDetails)
              }
            : undefined,
          onSuccess: (response, stats, successContext, networkDetails) => {
            copyLoaderStats(this.stats, stats)
            if (isMasterRequest) {
              masterServedFromLocalhost = isBlockedEventUrl(candidateUrl)
            }
            logHlsLoader('success', {
              videoId: options.videoId,
              requestUrl: context.url,
              candidateUrl,
              attempt,
              totalCandidates: candidates.length,
              statusCode: response.code,
              contextType: getContextType(context),
              fragment: getFragmentDebug(context),
              masterServedFromLocalhost,
              loadedBytes: this.stats.loaded,
              totalBytes: this.stats.total,
              loading: this.stats.loading,
              parsing: this.stats.parsing,
              buffering: this.stats.buffering,
            })
            emitHlsFailoverDebug({
              id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              timestamp: Date.now(),
              videoId: options.videoId,
              stage: 'success',
              requestUrl: context.url,
              candidateUrl,
              attempt,
              totalCandidates: candidates.length,
              statusCode: response.code,
            })
            writeNetworkResponseToCache(response.data, networkDetails)
            callbacks.onSuccess(response, this.stats, successContext, networkDetails)
          },
          onError: (response, errorContext, networkDetails, stats) => {
            ladder.onError(candidateUrl, isMasterRequest ? 'manifest' : 'segment')
            if (stats) {
              copyLoaderStats(this.stats, stats)
            }
            logHlsLoader('candidate error', {
              videoId: options.videoId,
              requestUrl: context.url,
              candidateUrl,
              attempt,
              totalCandidates: candidates.length,
              statusCode: response.code,
              errorText: response.text,
              contextType: getContextType(context),
              fragment: getFragmentDebug(context),
              hasNextCandidate: index < candidates.length - 1,
              loadedBytes: this.stats.loaded,
              totalBytes: this.stats.total,
            })
            if (index < candidates.length - 1) {
              index += 1
              loadCandidate()
              return
            }
            emitHlsFailoverDebug({
              id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              timestamp: Date.now(),
              videoId: options.videoId,
              stage: 'failure',
              requestUrl: context.url,
              candidateUrl,
              attempt,
              totalCandidates: candidates.length,
              errorText: response.text,
              statusCode: response.code,
            })
            callbacks.onError(response, errorContext, networkDetails, this.stats)
          },
          onTimeout: (stats, timeoutContext, networkDetails) => {
            ladder.onError(candidateUrl, isMasterRequest ? 'manifest' : 'segment')
            copyLoaderStats(this.stats, stats)
            logHlsLoader('candidate timeout', {
              videoId: options.videoId,
              requestUrl: context.url,
              candidateUrl,
              attempt,
              totalCandidates: candidates.length,
              contextType: getContextType(context),
              fragment: getFragmentDebug(context),
              hasNextCandidate: index < candidates.length - 1,
              loadedBytes: this.stats.loaded,
              totalBytes: this.stats.total,
            })
            if (index < candidates.length - 1) {
              index += 1
              loadCandidate()
              return
            }
            emitHlsFailoverDebug({
              id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              timestamp: Date.now(),
              videoId: options.videoId,
              stage: 'failure',
              requestUrl: context.url,
              candidateUrl,
              attempt,
              totalCandidates: candidates.length,
              errorText: 'timeout',
            })
            callbacks.onTimeout(this.stats, timeoutContext, networkDetails)
          },
        })
      }

      if (!maybeLoadFromVerifiedCache()) {
        loadCandidate()
      }
    }
  }
}
