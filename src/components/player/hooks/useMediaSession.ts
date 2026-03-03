import { useEffect, useRef } from 'react'

interface UseMediaSessionProps {
  title?: string
  artist?: string
  artwork?: string
  isPlaying: boolean
  currentTime: number
  duration: number
  playbackRate: number
  play: () => Promise<void>
  pause: () => void
  seek: (time: number) => void
  onPreviousTrack?: () => void
  onNextTrack?: () => void
}

/**
 * Hook to integrate with the Media Session API.
 * Provides lock screen / Control Center controls on iOS and other platforms.
 * Enables background audio playback when the browser tab is backgrounded.
 */
export function useMediaSession({
  title,
  artist,
  artwork,
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  play,
  pause,
  seek,
  onPreviousTrack,
  onNextTrack,
}: UseMediaSessionProps) {
  // Store callbacks in refs to avoid re-registering handlers on every render
  const playRef = useRef(play)
  const pauseRef = useRef(pause)
  const seekRef = useRef(seek)
  const onPreviousTrackRef = useRef(onPreviousTrack)
  const onNextTrackRef = useRef(onNextTrack)

  useEffect(() => {
    playRef.current = play
    pauseRef.current = pause
    seekRef.current = seek
    onPreviousTrackRef.current = onPreviousTrack
    onNextTrackRef.current = onNextTrack
  }, [play, pause, seek, onPreviousTrack, onNextTrack])

  // Set metadata when title/artist/artwork change
  useEffect(() => {
    if (!('mediaSession' in navigator) || !title) return

    const artworkEntries: MediaImage[] = artwork
      ? [
          { src: artwork, sizes: '512x512', type: 'image/jpeg' },
          { src: artwork, sizes: '256x256', type: 'image/jpeg' },
        ]
      : []

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: artist || undefined,
      artwork: artworkEntries,
    })
  }, [title, artist, artwork])

  // Register action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => playRef.current()],
      ['pause', () => pauseRef.current()],
      [
        'seekbackward',
        details => {
          const offset =
            (details as MediaSessionActionDetails & { seekOffset?: number }).seekOffset ?? 10
          seekRef.current(Math.max(0, currentTime - offset))
        },
      ],
      [
        'seekforward',
        details => {
          const offset =
            (details as MediaSessionActionDetails & { seekOffset?: number }).seekOffset ?? 10
          seekRef.current(Math.min(duration || Infinity, currentTime + offset))
        },
      ],
      [
        'seekto',
        details => {
          const seekTime = (details as MediaSessionActionDetails & { seekTime?: number }).seekTime
          if (seekTime != null) {
            seekRef.current(seekTime)
          }
        },
      ],
    ]

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler)
      } catch {
        // Action not supported by this browser
      }
    }

    // Previous/next track — set or clear based on availability
    try {
      navigator.mediaSession.setActionHandler(
        'previoustrack',
        onPreviousTrackRef.current ? () => onPreviousTrackRef.current?.() : null
      )
    } catch {
      // Not supported
    }

    try {
      navigator.mediaSession.setActionHandler(
        'nexttrack',
        onNextTrackRef.current ? () => onNextTrackRef.current?.() : null
      )
    } catch {
      // Not supported
    }

    return () => {
      // Clean up all handlers
      const actions: MediaSessionAction[] = [
        'play',
        'pause',
        'seekbackward',
        'seekforward',
        'seekto',
        'previoustrack',
        'nexttrack',
      ]
      for (const action of actions) {
        try {
          navigator.mediaSession.setActionHandler(action, null)
        } catch {
          // Ignore
        }
      }
    }
  }, [currentTime, duration, onPreviousTrack, onNextTrack])

  // Update playback state
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
  }, [isPlaying])

  // Update position state
  useEffect(() => {
    if (!('mediaSession' in navigator) || !duration || !Number.isFinite(duration)) return

    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate,
        position: Math.min(currentTime, duration),
      })
    } catch {
      // setPositionState can throw if values are invalid
    }
  }, [currentTime, duration, playbackRate])
}
