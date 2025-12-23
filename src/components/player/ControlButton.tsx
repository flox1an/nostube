import { type ReactNode } from 'react'

interface ControlButtonProps {
  onClick: () => void
  icon: ReactNode
  label: string
  active?: boolean
}

/**
 * Reusable control button for video player
 */
export function ControlButton({ onClick, icon, label, active = false }: ControlButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center w-10 h-10 rounded-full cursor-pointer transition-all hover:bg-white/20 ${
        active ? 'text-primary' : 'text-white'
      }`}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  )
}
