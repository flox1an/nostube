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

  // Global keyboard shortcuts (cinema mode, mute, play/pause, playlist navigation)
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input, textarea, or contenteditable element
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      // Ignore if the video element itself is focused (let native controls handle it)
      if (target.tagName === 'VIDEO' || target.tagName === 'HLS-VIDEO') {
        return
      }

      const videoEl = activeVideoElement.current

      // Toggle cinema mode on "T" key press
      if (event.key === 't' || event.key === 'T') {
        event.preventDefault()
        toggleCinemaMode()
        return
      }

      // Mute/unmute on "M" key press
      if (event.key === 'm' || event.key === 'M') {
        event.preventDefault()
        if (videoEl) {
          videoEl.muted = !videoEl.muted
        }
        return
      }

      // Play/pause on Space key press
      if (event.key === ' ') {
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

      // Previous video on comma key press (only in playlist mode)
      if (event.key === ',' && isPlaylistMode) {
        event.preventDefault()
        if (onPreviousVideo) {
          onPreviousVideo()
        }
        return
      }

      // Next video on period key press (only in playlist mode)
      if (event.key === '.' && isPlaylistMode) {
        event.preventDefault()
        if (onNextVideo) {
          onNextVideo()
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => {
      window.removeEventListener('keydown', handleKeyPress)
    }
  }, [toggleCinemaMode, onPreviousVideo, onNextVideo, isPlaylistMode])

  // Video element-specific keyboard shortcuts (seek, frame step, fullscreen)
  useEffect(() => {
    const el = activeVideoElement.current
    if (!el) return

    function handleKeyDown(event: KeyboardEvent) {
      const activeElement = document.activeElement
      if (
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.tagName === 'SELECT' ||
          activeElement.isContentEditable)
      ) {
        return
      }

      const key = event.key

      // Frame step forward/backward (when paused, and not in playlist mode)
      if ((key === '.' || key === ',') && !isPlaylistMode) {
        if (!el!.paused) return
        const frameStep = 1 / 30
        if (key === '.') {
          const nextTime = el!.currentTime + frameStep
          el!.currentTime = Number.isFinite(el!.duration)
            ? Math.min(el!.duration, nextTime)
            : nextTime
        } else {
          el!.currentTime = Math.max(0, el!.currentTime - frameStep)
        }
        event.preventDefault()
        return
      }

      // Arrow keys: Seek forward/backward 5 seconds
      if (key === 'ArrowRight' || key === 'ArrowLeft') {
        const delta = key === 'ArrowRight' ? 5 : -5
        const targetTime = el!.currentTime + delta
        const clampedTime =
          delta > 0 && Number.isFinite(el!.duration)
            ? Math.min(el!.duration, targetTime)
            : Math.max(0, targetTime)
        el!.currentTime = clampedTime
        event.preventDefault()
        return
      }

      // F key: Toggle fullscreen
      if (key === 'f' || key === 'F') {
        const fullscreenTarget =
          (el!.closest('media-controller') as HTMLElement | null) ?? (el! as HTMLElement)
        if (!document.fullscreenElement) {
          fullscreenTarget?.requestFullscreen?.().catch(() => {
            // Ignore fullscreen errors (e.g., user gesture requirements)
          })
        } else {
          document.exitFullscreen?.().catch(() => {
            // Ignore exit failures
          })
        }
        event.preventDefault()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isPlaylistMode])
}
