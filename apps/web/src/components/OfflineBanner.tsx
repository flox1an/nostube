import { useEffect, useRef } from 'react'
import { WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

export function OfflineBanner() {
  const isOnline = useOnlineStatus()
  const wasOffline = useRef(false)

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true
    } else if (wasOffline.current) {
      wasOffline.current = false
      toast.success('Back online')
    }
  }, [isOnline])

  if (isOnline) return null

  return (
    <div className="bg-destructive/15 text-destructive border-b border-destructive/20 px-4 py-2 text-center text-sm flex items-center justify-center gap-2 animate-in slide-in-from-top duration-300">
      <WifiOff className="h-4 w-4" />
      <span>You are offline</span>
    </div>
  )
}
