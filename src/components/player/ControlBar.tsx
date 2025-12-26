import { type ReactNode, memo, useCallback } from 'react'
import { PictureInPicture2, Subtitles, Maximize, Minimize, MoveHorizontal } from 'lucide-react'
import { PlayButton } from './PlayButton'
import { VolumeControl } from './VolumeControl'
import { TimeDisplay } from './TimeDisplay'
import { ProgressBar } from './ProgressBar'
import { SettingsMenu } from './SettingsMenu'
import { ControlButton } from './ControlButton'
import { type HlsQualityLevel } from './hooks/useHls'
import { type VideoVariant, type TextTrack } from '@/utils/video-event'
import { useIsMobile } from '@/hooks'

interface ControlBarProps {
  // Visibility
  isVisible: boolean

  // Playback state
  isPlaying: boolean
  currentTime: number
  duration: number
  bufferedPercentage: number

  // Playback controls
  onPlay: () => void
  onPause: () => void
  onSeek: (time: number) => void
  onSeekingChange?: (isSeeking: boolean) => void

  // Volume
  volume: number
  isMuted: boolean
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void

  // Playback rate
  playbackRate: number
  onPlaybackRateChange: (rate: number) => void

  // Quality - HLS
  isHls: boolean
  hlsLevels?: HlsQualityLevel[]
  hlsCurrentLevel?: number
  onHlsLevelChange?: (level: number) => void

  // Quality - Native
  videoVariants?: VideoVariant[]
  selectedVariantIndex?: number
  onVariantChange?: (index: number) => void

  // Captions/Subtitles
  hasCaptions: boolean
  captionsEnabled: boolean
  onToggleCaptions: () => void
  textTracks?: TextTrack[]
  selectedSubtitleLang?: string
  onSubtitleChange?: (lang: string) => void

  // PiP
  isPipSupported: boolean
  onTogglePip: () => void

  // Theater mode
  cinemaMode: boolean
  onToggleCinemaMode?: () => void

  // Fullscreen
  isFullscreen: boolean
  onToggleFullscreen: () => void

  // Optional children (for additional controls)
  children?: ReactNode
}

/**
 * Control bar container with all video controls
 */
export const ControlBar = memo(function ControlBar({
  isVisible,
  isPlaying,
  currentTime,
  duration,
  bufferedPercentage,
  onPlay,
  onPause,
  onSeek,
  onSeekingChange,
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
  playbackRate,
  onPlaybackRateChange,
  isHls,
  hlsLevels,
  hlsCurrentLevel,
  onHlsLevelChange,
  videoVariants,
  selectedVariantIndex,
  onVariantChange,
  hasCaptions,
  captionsEnabled,
  onToggleCaptions,
  textTracks,
  selectedSubtitleLang,
  onSubtitleChange,
  isPipSupported,
  onTogglePip,
  cinemaMode,
  onToggleCinemaMode,
  isFullscreen,
  onToggleFullscreen,
  children,
}: ControlBarProps) {
  // Use hook directly for reliable mobile detection
  const isMobile = useIsMobile()

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      onPause()
    } else {
      onPlay()
    }
  }, [isPlaying, onPlay, onPause])

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-20 bg-linear-to-t from-black/80 via-black/40 to-transparent pt-16 pb-2 px-2 transition-opacity duration-500 pointer-events-none ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Progress bar - re-enable pointer events */}
      <div className="px-2 pointer-events-auto">
        <ProgressBar
          currentTime={currentTime}
          duration={duration}
          bufferedPercentage={bufferedPercentage}
          onSeek={onSeek}
          onSeekingChange={onSeekingChange}
        />
      </div>

      {/* Controls row - re-enable pointer events */}
      <div className="flex items-center justify-between pointer-events-auto">
        {/* Left controls */}
        <div className="flex items-center">
          <PlayButton isPlaying={isPlaying} onClick={handlePlayPause} />
          <VolumeControl
            volume={volume}
            isMuted={isMuted}
            onVolumeChange={onVolumeChange}
            onToggleMute={onToggleMute}
          />
          <TimeDisplay currentTime={currentTime} duration={duration} />
        </div>

        {/* Right controls */}
        <div className="flex items-center">
          {/* PiP button - hidden on mobile */}
          {isPipSupported && !isMobile && (
            <ControlButton
              onClick={onTogglePip}
              icon={<PictureInPicture2 className="w-5 h-5" />}
              label="Picture in Picture"
            />
          )}

          {children}

          {/* Captions button */}
          {hasCaptions && (
            <ControlButton
              onClick={onToggleCaptions}
              icon={<Subtitles className="w-6 h-6" />}
              label={captionsEnabled ? 'Disable captions' : 'Enable captions'}
              active={captionsEnabled}
            />
          )}

          {/* Settings menu */}
          <SettingsMenu
            isHls={isHls}
            hlsLevels={hlsLevels}
            hlsCurrentLevel={hlsCurrentLevel}
            onHlsLevelChange={onHlsLevelChange}
            videoVariants={videoVariants}
            selectedVariantIndex={selectedVariantIndex}
            onVariantChange={onVariantChange}
            playbackRate={playbackRate}
            onPlaybackRateChange={onPlaybackRateChange}
            textTracks={textTracks}
            selectedSubtitleLang={selectedSubtitleLang}
            onSubtitleChange={onSubtitleChange}
          />

          {/* Theater mode button */}
          {!isMobile && onToggleCinemaMode && (
            <ControlButton
              onClick={onToggleCinemaMode}
              icon={<MoveHorizontal className="w-5 h-5" />}
              label={cinemaMode ? 'Exit theater mode' : 'Theater mode'}
              active={cinemaMode}
            />
          )}

          {/* Fullscreen button */}
          <ControlButton
            onClick={onToggleFullscreen}
            icon={
              isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />
            }
            label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          />
        </div>
      </div>
    </div>
  )
})
