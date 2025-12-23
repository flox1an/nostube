import { Play, Pause } from 'lucide-react'

interface PlayButtonProps {
  isPlaying: boolean
  onClick: () => void
}

/**
 * Play/Pause button for video controls
 */
export function PlayButton({ isPlaying, onClick }: PlayButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center w-10 h-10 text-white rounded-full cursor-pointer transition-all hover:bg-neutral-700/50"
      aria-label={isPlaying ? 'Pause' : 'Play'}
    >
      {isPlaying ? (
        <Pause className="w-6 h-6" fill="currentColor" />
      ) : (
        <Play className="w-6 h-6" fill="currentColor" />
      )}
    </button>
  )
}
