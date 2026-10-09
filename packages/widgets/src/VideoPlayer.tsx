import { useEffect, useRef, useState } from 'react'
import type { BlossomServer } from '@nostube/core'
import { PlaybackUrlLadder, type PlaybackUrlLadderOptions } from '@nostube/core/playback-url-ladder'
import type { VideoEvent } from '@nostube/core/video-event'

export interface VideoPlayerProps {
  video: VideoEvent
  autoPlay?: boolean
  /**
   * Blossom servers to try when the declared URLs fail: the blob is requested by its hash from
   * each of them. Typically the creator's own server list (kind 10063).
   */
  blossomServers?: BlossomServer[]
}

const isHls = (url: string, mimeType?: string) =>
  /\.m3u8(\?|$)/i.test(url) || mimeType?.includes('mpegurl') === true

/** The URL fallback policy for one video: declared URLs first, then the hash on Blossom servers. */
export function createPlaybackLadder(video: VideoEvent, blossomServers: BlossomServer[] = []) {
  const ladder = new PlaybackUrlLadder(playbackOptions(video, blossomServers))
  // The ladder starts from the variant URLs; the fallback URLs the event declares come after them.
  ladder.merge(
    video.videoVariants.flatMap(v => v.fallbackUrls),
    'original'
  )
  return ladder
}

function playbackOptions(
  video: VideoEvent,
  blossomServers: BlossomServer[]
): PlaybackUrlLadderOptions {
  return {
    urls: video.urls,
    variants: video.videoVariants,
    blossomServers,
    sha256: video.x ?? video.videoVariants[0]?.hash,
    kind: video.kind,
    mediaType: video.mediaType ?? 'video',
    authorPubkey: video.pubkey,
  }
}

/**
 * PLACEHOLDER until the player of apps/web moves into this package; it is then deleted, together
 * with createPlaybackLadder. Skeleton player: a native <video> element, hls.js for m3u8 sources, the core URL ladder for
 * failover. No quality menu, captions or segment-level failover yet; the full web player is not
 * shared.
 */
export function VideoPlayer(props: VideoPlayerProps) {
  // A new video starts over with a fresh ladder.
  return <Player key={props.video.id} {...props} />
}

function Player({ video, autoPlay = false, blossomServers }: VideoPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null)
  const [ladder] = useState(() => createPlaybackLadder(video, blossomServers))
  const [url, setUrl] = useState(ladder.currentUrl)
  const [failed, setFailed] = useState(false)
  const mimeType = video.videoVariants.find(v => v.url === url)?.mimeType ?? video.mimeType

  const fail = () => {
    if (url) ladder.onError(url, 'media')
    const next = ladder.currentUrl
    if (next && next !== url) setUrl(next)
    else setFailed(true)
  }

  // Servers that arrive after the first render (e.g. the creator's list) extend the ladder.
  useEffect(() => {
    if (!blossomServers?.length) return
    const added = ladder.refresh(playbackOptions(video, blossomServers))
    if (added && failed && ladder.tryNext()) {
      setFailed(false)
      setUrl(ladder.currentUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blossomServers])

  useEffect(() => {
    const element = ref.current
    if (!element || !url) return
    if (!isHls(url, mimeType) || element.canPlayType('application/vnd.apple.mpegurl')) {
      element.src = url
      return
    }
    let destroyed = false
    let cleanup = () => {}
    void import('hls.js').then(({ default: Hls }) => {
      if (destroyed) return
      if (!Hls.isSupported()) {
        element.src = url
        return
      }
      const hls = new Hls()
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) fail()
      })
      hls.loadSource(url)
      hls.attachMedia(element)
      cleanup = () => hls.destroy()
    })
    return () => {
      destroyed = true
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, mimeType])

  if (!url) {
    return <p className="py-12 text-center text-neutral-500">This video has no playable source.</p>
  }
  if (failed) {
    return (
      <p className="py-12 text-center text-neutral-500">
        This video could not be played: every source failed.
      </p>
    )
  }

  return (
    <video
      ref={ref}
      controls
      autoPlay={autoPlay}
      playsInline
      poster={video.images[0]}
      onError={fail}
      className="aspect-video w-full rounded-lg bg-black"
    />
  )
}
