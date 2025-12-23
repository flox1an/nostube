import { memo } from 'react'
import { Loader2 } from 'lucide-react'

interface LoadingSpinnerProps {
  isVisible: boolean
}

/**
 * Center loading spinner overlay for buffering state
 */
export const LoadingSpinner = memo(function LoadingSpinner({ isVisible }: LoadingSpinnerProps) {
  if (!isVisible) {
    return null
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none z-10">
      <Loader2 className="h-16 w-16 animate-spin text-white" />
    </div>
  )
})
