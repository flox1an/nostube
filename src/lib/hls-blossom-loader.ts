import Hls from 'hls.js'
import type {
  HlsConfig,
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoaderStats,
} from 'hls.js'
import type { BlossomServer, CachingServer } from '@/contexts/AppContext'
import { extractBlossomHash } from '@/lib/blossom-url'
import { generateMediaUrls } from '@/lib/media-url-generator'
import { emitHlsFailoverDebug, isHlsDebugEnabled } from '@/lib/hls-failover-debug'

interface HlsBlossomLoaderOptions {
  blossomServers: BlossomServer[]
  cachingServers: CachingServer[]
  authorPubkey?: string
  videoId?: string
  masterUrl?: string
  localhostProxyMode?: 'always' | 'master-gated' | 'never'
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

function buildFallbackUrls(url: string, options: HlsBlossomLoaderOptions): string[] {
  const { sha256 } = extractBlossomHash(url)
  if (!sha256) {
    return [url]
  }

  const generated = generateMediaUrls({
    urls: [url],
    blossomServers: options.blossomServers,
    cachingServers: options.cachingServers,
    sha256,
    mediaType: 'video',
    authorPubkey: options.authorPubkey,
    proxyConfig: { enabled: true },
  }).urls

  if (generated.length === 0) {
    return [url]
  }

  return generated
}

function isLocalhostUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

function normalizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).href
  } catch {
    return url
  }
}

export function createBlossomHlsLoader(options: HlsBlossomLoaderOptions) {
  const BaseLoader = Hls.DefaultConfig.loader as new (config: HlsConfig) => Loader<LoaderContext>
  let masterServedFromLocalhost: boolean | null = null

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

      let candidates = buildFallbackUrls(context.url, options)
      const localhostMode = options.localhostProxyMode ?? 'master-gated'
      const candidatesBeforeFiltering = candidates

      if (localhostMode === 'never') {
        candidates = candidates.filter(url => !isLocalhostUrl(url))
      } else if (
        localhostMode === 'master-gated' &&
        !isMasterRequest &&
        masterServedFromLocalhost === false
      ) {
        candidates = candidates.filter(url => !isLocalhostUrl(url))
      }

      if (candidates.length === 0) {
        candidates = [context.url]
      }
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
              masterServedFromLocalhost = isLocalhostUrl(candidateUrl)
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
            callbacks.onSuccess(response, this.stats, successContext, networkDetails)
          },
          onError: (response, errorContext, networkDetails, stats) => {
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

      loadCandidate()
    }
  }
}
