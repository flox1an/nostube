import { X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export function DisclaimerBanner() {
  const [isVisible, setIsVisible] = useState(true)
  const { user } = useCurrentUser()
  /*
  useEffect(() => {
   const dismissed = localStorage.getItem("disclaimer-dismissed");
    if (dismissed) {
      setIsVisible(false);
    }
  }, []);*/

  const handleDismiss = () => {
    localStorage.setItem('disclaimer-dismissed', 'true')
    setIsVisible(false)
  }

  if (!isVisible) return null

  if (!user) return null

  return (
    <div className="p-4 container mx-auto">
      <Alert variant="destructive" className="flex p-1 items-center">
        <AlertDescription className="px-4 grow">
          This is EXPERIMENTAL. Upload does NOT work yet. Following will wipe your follows, etc..
          beware!
        </AlertDescription>
        <Button className="p-2" variant="ghost" size="sm" onClick={handleDismiss}>
          <X className="h-4 w-4" />
          <span className="sr-only">Dismiss</span>
        </Button>
      </Alert>
    </div>
  )
}
