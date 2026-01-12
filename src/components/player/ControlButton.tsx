import { type ReactNode, memo } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Kbd } from '@/components/ui/kbd'

interface ControlButtonProps {
  onClick: () => void
  icon: ReactNode
  label: string
  shortcut?: string
  active?: boolean
}

/**
 * Reusable control button for video player
 */
export const ControlButton = memo(function ControlButton({
  onClick,
  icon,
  label,
  shortcut,
  active = false,
}: ControlButtonProps) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={`flex items-center justify-center w-10 h-10 rounded-full cursor-pointer transition-all hover:bg-black/40 ${
            active ? 'text-primary' : 'text-white'
          }`}
          aria-label={label}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="flex items-center gap-2">
        <span>{label}</span>
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
})
