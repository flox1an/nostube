import { useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

interface PlaylistVideo {
  id: string
  link: string
  [key: string]: any
}

interface UsePlaylistNavigationProps {
  playlistParam: string | null
  currentVideoId: string | undefined
  playlistVideos: PlaylistVideo[]
  shouldLoop: boolean
  onPlayPosReset: () => void
}

/**
 * Hook that manages playlist navigation
 * - Tracks current position in playlist
 * - Provides navigation to next/previous videos
 * - Handles auto-advance on video end
 */
export function usePlaylistNavigation({
  playlistParam,
  currentVideoId,
  playlistVideos,
  shouldLoop,
  onPlayPosReset,
}: UsePlaylistNavigationProps) {
  const navigate = useNavigate()

  // Get current video index in playlist
  const currentPlaylistIndex = useMemo(() => {
    if (!playlistParam || !currentVideoId) return -1
    return playlistVideos.findIndex(item => item.id === currentVideoId)
  }, [playlistParam, currentVideoId, playlistVideos])

  // Get next video in playlist
  const nextPlaylistVideo = useMemo(() => {
    if (currentPlaylistIndex === -1) return undefined
    return playlistVideos[currentPlaylistIndex + 1]
  }, [currentPlaylistIndex, playlistVideos])

  // Get previous video in playlist
  const prevPlaylistVideo = useMemo(() => {
    if (currentPlaylistIndex === -1 || currentPlaylistIndex === 0) return undefined
    return playlistVideos[currentPlaylistIndex - 1]
  }, [currentPlaylistIndex, playlistVideos])

  // Navigate to previous video
  const navigateToPrevious = useCallback(() => {
    if (!playlistParam || !prevPlaylistVideo) return
    onPlayPosReset()
    navigate(`/video/${prevPlaylistVideo.link}?playlist=${encodeURIComponent(playlistParam)}`)
  }, [playlistParam, prevPlaylistVideo, navigate, onPlayPosReset])

  // Navigate to next video
  const navigateToNext = useCallback(() => {
    if (!playlistParam || !nextPlaylistVideo) return
    onPlayPosReset()
    navigate(`/video/${nextPlaylistVideo.link}?playlist=${encodeURIComponent(playlistParam)}`)
  }, [playlistParam, nextPlaylistVideo, navigate, onPlayPosReset])

  // Handle video end (auto-advance to next video)
  const handlePlaylistVideoEnd = useCallback(() => {
    if (!playlistParam || shouldLoop || !nextPlaylistVideo) return
    onPlayPosReset()
    navigate(
      `/video/${nextPlaylistVideo.link}?playlist=${encodeURIComponent(playlistParam)}&autoplay=true`
    )
  }, [playlistParam, shouldLoop, nextPlaylistVideo, navigate, onPlayPosReset])

  return {
    currentPlaylistIndex,
    nextPlaylistVideo,
    prevPlaylistVideo,
    navigateToPrevious,
    navigateToNext,
    handlePlaylistVideoEnd,
  }
}
