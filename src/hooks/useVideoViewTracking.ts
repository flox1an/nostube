import { useCallback, useEffect, useRef } from 'react'
import type { Event as NostrEvent } from 'nostr-tools'
import { getSeenRelays } from 'applesauce-core/helpers/relays'
import { useCurrentUser } from './useCurrentUser'
import { buildVideoViewEvent, type ViewEventSource, type ViewSegment } from '@/lib/view-events'
import { enqueueViewEvent } from '@/lib/view-event-outbox'
import type { VideoEvent } from '@/utils/video-event'

type TrackableVideo =
  | Pick<NostrEvent, 'id' | 'kind' | 'pubkey' | 'tags'>
  | Pick<VideoEvent, 'id' | 'kind' | 'pubkey' | 'identifier'>

export interface UseVideoViewTrackingOptions {
  video: TrackableVideo | null | undefined
  mediaElement: HTMLMediaElement | null
  active?: boolean
  source: ViewEventSource
  sourceDetail?: string
  relayHint?: string
}

const SEEK_GAP_SECONDS = 2.5

function getVideoIdentifier(video: TrackableVideo): string | undefined {
  if ('identifier' in video) return video.identifier
  if (!('tags' in video)) return undefined
  return video.tags.find(tag => tag[0] === 'd')?.[1]
}

function getRelayHint(video: TrackableVideo, fallback?: string): string | undefined {
  if (fallback) return fallback
  if (!('tags' in video)) return undefined
  return Array.from(getSeenRelays(video as NostrEvent) ?? [])[0]
}

export function useVideoViewTracking({
  video,
  mediaElement,
  active = true,
  source,
  sourceDetail,
  relayHint,
}: UseVideoViewTrackingOptions) {
  const { user } = useCurrentUser()
  const segmentsRef = useRef<ViewSegment[]>([])
  const segmentStartRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number | null>(null)
  const loopCountRef = useRef(0)
  const finalizedKeyRef = useRef<string | null>(null)

  const resetSession = useCallback(() => {
    segmentsRef.current = []
    segmentStartRef.current = null
    lastTimeRef.current = null
    loopCountRef.current = 0
  }, [])

  const commitOpenSegment = useCallback((endTime: number) => {
    const start = segmentStartRef.current
    if (start === null || !Number.isFinite(endTime)) return

    if (endTime > start) {
      segmentsRef.current.push({ start, end: endTime })
    }
    segmentStartRef.current = null
  }, [])

  const ensureSegmentStarted = useCallback((time: number) => {
    if (!Number.isFinite(time)) return
    if (segmentStartRef.current === null) {
      segmentStartRef.current = Math.max(0, time)
    }
    lastTimeRef.current = time
  }, [])

  const finalize = useCallback(() => {
    if (!video || !user) {
      resetSession()
      return
    }

    const currentTime = mediaElement?.currentTime
    if (typeof currentTime === 'number') {
      commitOpenSegment(currentTime)
    }

    const relay = getRelayHint(video, relayHint)
    const identifier = getVideoIdentifier(video)
    const built = buildVideoViewEvent({
      videoId: video.id,
      videoKind: video.kind,
      videoPubkey: video.pubkey,
      videoIdentifier: identifier,
      relayHint: relay,
      viewerPubkey: user.pubkey,
      segments: segmentsRef.current,
      source,
      sourceDetail,
      loopCount: loopCountRef.current,
    })

    if (!built) {
      resetSession()
      return
    }

    const sessionKey = `${video.id}:${built.event.created_at}:${JSON.stringify(
      built.normalizedSegments
    )}`
    if (finalizedKeyRef.current === sessionKey) return
    finalizedKeyRef.current = sessionKey

    void user.signer
      .signEvent(built.event)
      .then(signedEvent =>
        enqueueViewEvent({
          viewerPubkey: user.pubkey,
          videoId: video.id,
          videoKind: video.kind,
          videoPubkey: video.pubkey,
          videoIdentifier: identifier,
          relayHint: relay,
          source,
          sourceDetail,
          segments: built.normalizedSegments,
          loopCount: loopCountRef.current,
          event: signedEvent,
        })
      )
      .catch(error => {
        if (import.meta.env.DEV) {
          console.warn('[useVideoViewTracking] View event signing declined or failed:', error)
        }
      })

    resetSession()
  }, [commitOpenSegment, mediaElement, relayHint, resetSession, source, sourceDetail, user, video])

  useEffect(() => {
    resetSession()
    finalizedKeyRef.current = null
  }, [resetSession, video?.id])

  useEffect(() => {
    if (!mediaElement || !active) return

    const handlePlay = () => {
      ensureSegmentStarted(mediaElement.currentTime)
    }

    const handleTimeUpdate = () => {
      if (mediaElement.paused || mediaElement.seeking) return

      const currentTime = mediaElement.currentTime
      const lastTime = lastTimeRef.current
      if (lastTime !== null) {
        if (currentTime + 0.5 < lastTime) {
          commitOpenSegment(lastTime)
          loopCountRef.current += 1
          segmentStartRef.current = currentTime
        } else if (currentTime - lastTime > SEEK_GAP_SECONDS) {
          commitOpenSegment(lastTime)
          segmentStartRef.current = currentTime
        }
      }

      ensureSegmentStarted(currentTime)
    }

    const handlePause = () => {
      commitOpenSegment(mediaElement.currentTime)
    }

    const handleSeeking = () => {
      const lastTime = lastTimeRef.current ?? mediaElement.currentTime
      commitOpenSegment(lastTime)
      lastTimeRef.current = null
    }

    const handleEnded = () => {
      commitOpenSegment(mediaElement.currentTime)
      finalize()
    }

    mediaElement.addEventListener('play', handlePlay)
    mediaElement.addEventListener('playing', handlePlay)
    mediaElement.addEventListener('timeupdate', handleTimeUpdate)
    mediaElement.addEventListener('pause', handlePause)
    mediaElement.addEventListener('seeking', handleSeeking)
    mediaElement.addEventListener('ended', handleEnded)

    if (!mediaElement.paused) {
      ensureSegmentStarted(mediaElement.currentTime)
    }

    return () => {
      mediaElement.removeEventListener('play', handlePlay)
      mediaElement.removeEventListener('playing', handlePlay)
      mediaElement.removeEventListener('timeupdate', handleTimeUpdate)
      mediaElement.removeEventListener('pause', handlePause)
      mediaElement.removeEventListener('seeking', handleSeeking)
      mediaElement.removeEventListener('ended', handleEnded)
    }
  }, [active, commitOpenSegment, ensureSegmentStarted, finalize, mediaElement])

  useEffect(() => {
    if (active) return
    finalize()
  }, [active, finalize])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') finalize()
    }

    window.addEventListener('pagehide', finalize)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pagehide', finalize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      finalize()
    }
  }, [finalize])
}
