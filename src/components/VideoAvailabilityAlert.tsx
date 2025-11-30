import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCurrentUser } from '@/hooks'

interface VideoAvailabilityAlertProps {
  blossomServerCount: number
  onMirror: () => void
}

/**
 * Alert shown when a video has limited availability (fewer than 2 servers)
 * Suggests mirroring for better redundancy
 * Only displayed when user is logged in and video has at least one Blossom URL
 */
export function VideoAvailabilityAlert({
  blossomServerCount,
  onMirror,
}: VideoAvailabilityAlertProps) {
  const currentUser = useCurrentUser()

  // Only show if logged in, has at least one Blossom URL, and fewer than 2 servers
  if (!currentUser.user || blossomServerCount === 0 || blossomServerCount > 1) return null

  return (
    <Alert className="border-primary">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Limited Availability</AlertTitle>
      <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <span className="flex-1">
          This video is available on {blossomServerCount} blossom{' '}
          {blossomServerCount === 1 ? 'server' : 'servers'}. Consider mirroring it to your servers
          for better redundancy.
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
