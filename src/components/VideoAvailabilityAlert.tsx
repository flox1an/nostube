import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface VideoAvailabilityAlertProps {
  blossomServerCount: number
  onMirror: () => void
}

/**
 * Alert shown when a video is only available on 1 blossom server
 * Suggests mirroring for better redundancy
 */
export function VideoAvailabilityAlert({ blossomServerCount, onMirror }: VideoAvailabilityAlertProps) {
  if (blossomServerCount !== 1) return null

  return (
    <Alert>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Limited Availability</AlertTitle>
      <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <span className="flex-1">
          This video is only available on 1 blossom server. Consider mirroring it to your servers.
        </span>
        <Button
          onClick={onMirror}
          disabled={false}
          size="sm"
          className="sm:ml-4 shrink-0 sm:self-center"
        >
          Mirror
        </Button>
      </AlertDescription>
    </Alert>
  )
}
