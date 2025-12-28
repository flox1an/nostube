import { memo } from 'react'
import { Play, Pause } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface PlayButtonProps {
  isPlaying: boolean
  onClick: () => void
}

/**
 * Play/Pause button for video controls
 */
export const PlayButton = memo(function PlayButton({ isPlaying, onClick }: PlayButtonProps) {
  const label = isPlaying ? 'Pause' : 'Play'
  const tooltip = `${label} (K)`

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="flex items-center justify-center w-10 h-10 text-white rounded-full cursor-pointer transition-all hover:bg-black/40"
          aria-label={label}
        >
          {isPlaying ? (
            <Pause className="w-6 h-6" fill="currentColor" />
          ) : (
            <Play className="w-6 h-6" fill="currentColor" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  )
})
