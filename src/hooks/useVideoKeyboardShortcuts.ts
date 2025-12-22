import { useEffect, useRef } from 'react'

interface UseVideoKeyboardShortcutsProps {
  videoElement: HTMLVideoElement | null
  toggleCinemaMode: () => void
  onPreviousVideo?: () => void
  onNextVideo?: () => void
  isPlaylistMode: boolean
}

/**
 * Hook that manages keyboard shortcuts for video playback and navigation
 * - Space: Play/pause
 * - M: Mute/unmute
 * - T: Toggle cinema mode
 * - F: Fullscreen
 * - Arrow keys: Seek forward/backward
 * - . / ,: Frame step (when paused) or next/prev video (in playlist mode)
 */
export function useVideoKeyboardShortcuts({
  videoElement,
  toggleCinemaMode,
  onPreviousVideo,
  onNextVideo,
  isPlaylistMode,
}: UseVideoKeyboardShortcutsProps) {
  const activeVideoElement = useRef<HTMLVideoElement | null>(null)

  // Update active video element ref
  useEffect(() => {
    activeVideoElement.current = videoElement
  }, [videoElement])

  // Unified keyboard shortcuts handler
  // Handles all keyboard shortcuts globally, regardless of which element is focused
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input, textarea, or contenteditable element
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }

      const videoEl = activeVideoElement.current
      const key = event.key

      // Toggle cinema mode on "T" key press
      if (key === 't' || key === 'T') {
        event.preventDefault()
        toggleCinemaMode()
        return
      }

      // Mute/unmute on "M" key press
      if (key === 'm' || key === 'M') {
        event.preventDefault()
        if (videoEl) {
          videoEl.muted = !videoEl.muted
        }
        return
      }

      // Play/pause on Space key press
      if (key === ' ') {
        event.preventDefault()
        if (videoEl) {
          if (videoEl.paused) {
            videoEl.play()
          } else {
            videoEl.pause()
          }
        }
        return
      }

      // Frame step or playlist navigation on comma/period keys
      if (key === ',' || key === '.') {
        event.preventDefault()

        // In playlist mode, navigate between videos
        if (isPlaylistMode) {
          if (key === ',' && onPreviousVideo) {
            onPreviousVideo()
          } else if (key === '.' && onNextVideo) {
            onNextVideo()
          }
          return
        }

        // When not in playlist mode and video is paused, frame step
        if (videoEl && videoEl.paused) {
          const frameStep = 1 / 30
          if (key === '.') {
            const nextTime = videoEl.currentTime + frameStep
            videoEl.currentTime = Number.isFinite(videoEl.duration)
              ? Math.min(videoEl.duration, nextTime)
              : nextTime
          } else {
            videoEl.currentTime = Math.max(0, videoEl.currentTime - frameStep)
          }
        }
        return
      }

      // Arrow keys: Seek forward/backward 5 seconds
      if (key === 'ArrowRight' || key === 'ArrowLeft') {
        event.preventDefault()
        if (videoEl) {
          const delta = key === 'ArrowRight' ? 5 : -5
          const targetTime = videoEl.currentTime + delta
          const clampedTime =
            delta > 0 && Number.isFinite(videoEl.duration)
              ? Math.min(videoEl.duration, targetTime)
              : Math.max(0, targetTime)
          videoEl.currentTime = clampedTime
        }
        return
      }

      // Fullscreen on "F" key press
      if (key === 'f' || key === 'F') {
        event.preventDefault()
        if (videoEl) {
          // Try to find the media-controller parent for fullscreen
          const fullscreenTarget =
            (videoEl.closest('media-controller') as HTMLElement | null) ?? (videoEl as HTMLElement)

          if (!document.fullscreenElement) {
            fullscreenTarget?.requestFullscreen?.().catch(() => {
              // Ignore fullscreen errors (e.g., user gesture requirements)
            })
          } else {
            document.exitFullscreen?.().catch(() => {
              // Ignore exit failures
            })
          }
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [toggleCinemaMode, onPreviousVideo, onNextVideo, isPlaylistMode])
}
