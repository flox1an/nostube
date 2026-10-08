import { useMemo, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { buildDesktopPlayerUrl, buildVideoUrl } from '@/utils/video-utils'

interface PlaylistVideo {
  id: string
  link: string
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
  const location = useLocation()
  const isDesktopPlayer = location.pathname.startsWith('/desktop/player/')

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
    const route = isDesktopPlayer
      ? buildDesktopPlayerUrl(prevPlaylistVideo.link, { playlist: playlistParam })
      : buildVideoUrl(prevPlaylistVideo.link, 'video', { playlist: playlistParam })
    navigate(route)
  }, [playlistParam, prevPlaylistVideo, navigate, onPlayPosReset, isDesktopPlayer])

  // Navigate to next video
  const navigateToNext = useCallback(() => {
    if (!playlistParam || !nextPlaylistVideo) return
    onPlayPosReset()
    const route = isDesktopPlayer
      ? buildDesktopPlayerUrl(nextPlaylistVideo.link, { playlist: playlistParam })
      : buildVideoUrl(nextPlaylistVideo.link, 'video', { playlist: playlistParam })
    navigate(route)
  }, [playlistParam, nextPlaylistVideo, navigate, onPlayPosReset, isDesktopPlayer])

  // Handle video end (auto-advance to next video)
  const handlePlaylistVideoEnd = useCallback(() => {
    if (!playlistParam || shouldLoop || !nextPlaylistVideo) return
    onPlayPosReset()
    navigate(
      isDesktopPlayer
        ? buildDesktopPlayerUrl(nextPlaylistVideo.link, { playlist: playlistParam, autoplay: true })
        : buildVideoUrl(nextPlaylistVideo.link, 'video', {
            playlist: playlistParam,
            autoplay: true,
          })
    )
  }, [playlistParam, shouldLoop, nextPlaylistVideo, navigate, onPlayPosReset, isDesktopPlayer])

  return {
    currentPlaylistIndex,
    nextPlaylistVideo,
    prevPlaylistVideo,
    navigateToPrevious,
    navigateToNext,
    handlePlaylistVideoEnd,
  }
}
