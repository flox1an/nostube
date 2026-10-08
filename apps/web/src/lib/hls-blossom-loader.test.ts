import { describe, expect, it } from 'vitest'
import Hls from 'hls.js'
import type {
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoaderStats,
} from 'hls.js'
import { createBlossomHlsLoader } from './hls-blossom-loader'
import { PlaybackUrlLadder } from './playback-url-ladder'

const SHA = '3751b84f27234fc8ce3227d132b422f7e00f4a50c6cdc322080fed89a302d7dd'
const ORIGIN = `https://origin.example/${SHA}.m3u8`
const MIRROR = `https://mirror.example/${SHA}.m3u8`

function stubStats(): LoaderStats {
  return {
    aborted: false,
    loaded: 0,
    retry: 0,
    total: 0,
    chunkCount: 0,
    bwEstimate: 0,
    loading: { start: 0, first: 0, end: 0 },
    parsing: { start: 0, end: 0 },
    buffering: { start: 0, first: 0, end: 0 },
  }
}

/**
 * Records every candidate URL the wrapper requests. The origin always fails
 * with a 503; any other URL succeeds, so assertions observe which candidate
 * the failover walk picked. Delivery is synchronous — the wrapper's candidate
 * walk does not require a tick between candidates.
 */
class StubLoader implements Loader<LoaderContext> {
  static requested: string[] = []
  stats = stubStats()
  context: LoaderContext | null = null

  load(
    context: LoaderContext,
    _config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>
  ) {
    this.context = context
    StubLoader.requested.push(context.url)
    if (context.url === ORIGIN) {
      callbacks.onError({ code: 503, text: 'Service Unavailable' }, context, null, this.stats)
    } else {
      // Blossom servers redirect to hash-prefixed internal storage paths
      callbacks.onSuccess(
        {
          url: `https://cdn.internal.example/uploads/3/75/1b/blob`,
          data: new ArrayBuffer(4),
          code: 200,
        },
        this.stats,
        context,
        null
      )
    }
  }

  destroy() {}
  abort() {}
}

describe('createBlossomHlsLoader', () => {
  it('retries the manifest against URLs collected after the original failed', () => {
    const original = Hls.DefaultConfig.loader
    Hls.DefaultConfig.loader = StubLoader as unknown as typeof original
    try {
      StubLoader.requested = []
      // Embed state at first load: only the event URL, no servers configured yet
      const ladder = new PlaybackUrlLadder({
        urls: [ORIGIN],
        blossomServers: [],
        mediaType: 'video',
        sha256: SHA,
      })
      const LoaderClass = createBlossomHlsLoader({
        blossomServers: [],
        cachingServers: [],
        masterUrl: ORIGIN,
        localhostProxyMode: 'never',
        ladder,
      })
      const loader = new LoaderClass({} as Hls['config'])
      const context = { url: ORIGIN, responseType: '' } as LoaderContext

      const outcomes: string[] = []
      const callbacks = {
        onProgress: null,
        onSuccess: (_response: unknown, _stats: unknown, ctx: LoaderContext) =>
          outcomes.push(`success:${ctx.url}`),
        onError: (response: { code: number }) => outcomes.push(`error:${response.code}`),
        onTimeout: () => outcomes.push('timeout'),
      } as unknown as LoaderCallbacks<LoaderContext>

      loader.load(context, {} as LoaderConfiguration, callbacks)
      expect(StubLoader.requested).toEqual([ORIGIN])
      expect(outcomes).toEqual(['error:503'])

      // Discovery lands afterwards; hls.js re-invokes load() with the same context
      ladder.merge([MIRROR], 'discovered')
      loader.load(context, {} as LoaderConfiguration, callbacks)

      expect(StubLoader.requested).toEqual([ORIGIN, MIRROR])
      expect(outcomes).toEqual(['error:503', `success:${MIRROR}`])
    } finally {
      Hls.DefaultConfig.loader = original
    }
  })

  it('reports the requested URL so playlists resolve against the flat blob path', () => {
    const original = Hls.DefaultConfig.loader
    Hls.DefaultConfig.loader = StubLoader as unknown as typeof original
    try {
      StubLoader.requested = []
      const ladder = new PlaybackUrlLadder({
        urls: [MIRROR],
        blossomServers: [],
        mediaType: 'video',
        sha256: SHA,
      })
      const LoaderClass = createBlossomHlsLoader({
        blossomServers: [],
        cachingServers: [],
        masterUrl: MIRROR,
        localhostProxyMode: 'never',
        ladder,
      })
      const loader = new LoaderClass({} as Hls['config'])
      const context = { url: MIRROR, responseType: '' } as LoaderContext

      let reportedUrl: string | null = null
      const callbacks = {
        onProgress: null,
        onSuccess: (response: { url: string }) => {
          reportedUrl = response.url
        },
        onError: () => {},
        onTimeout: () => {},
      } as unknown as LoaderCallbacks<LoaderContext>

      loader.load(context, {} as LoaderConfiguration, callbacks)

      expect(reportedUrl).toBe(MIRROR)
    } finally {
      Hls.DefaultConfig.loader = original
    }
  })
})
