import { useEffect, useRef } from 'react'

interface UseVideoKeyboardShortcutsProps {
  videoElement: HTMLVideoElement | null
  toggleCinemaMode: () => void
  onPreviousVideo?: () => void
  onNextVideo?: () => void
  isPlaylistMode: boolean
}

/**
 * Hook that manages keyboard shortcuts for video page-level actions
 * Note: Space, M, F, and arrow keys are now handled by VideoPlayer directly
 * for proper seek accumulator integration.
 *
 * This hook handles:
 * - T: Toggle cinema mode
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

      // Note: Space, M, F, and arrow keys are handled by VideoPlayer
      // for proper seek accumulator integration
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [toggleCinemaMode, onPreviousVideo, onNextVideo, isPlaylistMode])
}
