import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, Pause } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/tooltip'
import { Kbd } from '../components/kbd'

interface PlayButtonProps {
  isPlaying: boolean
  onClick: () => void
}

/**
 * Play/Pause button for video controls
 */
export const PlayButton = memo(function PlayButton({ isPlaying, onClick }: PlayButtonProps) {
  const { t } = useTranslation()
  const label = isPlaying ? t('player.pause') : t('player.play')

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
      <TooltipContent side="top" className="flex items-center gap-2">
        <span>{label}</span>
        <Kbd>K</Kbd>
      </TooltipContent>
    </Tooltip>
  )
})
