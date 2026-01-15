import { useState, useRef, useEffect, useCallback, memo } from 'react'
import { Button } from '@/components/ui/button'
import { Zap, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useZap, useEventZaps, useCurrentUser } from '@/hooks'
import { formatSats } from '@/lib/zap-utils'
import { ZapDialog } from './ZapDialog'

interface ZapButtonProps {
  eventId?: string // Optional - not provided when zapping a profile directly
  kind?: number
  authorPubkey: string
  layout?: 'vertical' | 'inline'
  className?: string
  currentTime?: number // Current video playback position (for timestamped zaps)
  identifier?: string // d-tag for addressable events (kinds 34235, 34236)
}

const LONG_PRESS_DELAY = 500

export const ZapButton = memo(function ZapButton({
  eventId,
  kind = 1,
  authorPubkey,
  layout = 'vertical',
  className = '',
  currentTime,
  identifier,
}: ZapButtonProps) {
  const [showZapDialog, setShowZapDialog] = useState(false)
  const [capturedTimestamp, setCapturedTimestamp] = useState<number | undefined>(undefined)
  const longPressTimer = useRef<number | null>(null)
  const isLongPress = useRef(false)

  const { user } = useCurrentUser()
  const { zap, generateInvoice, isZapping, isConnected } = useZap({
    eventId,
    authorPubkey,
  })
  // Only fetch zap stats if we have an eventId (not for profile zaps)
  const { totalSats } = useEventZaps({
    eventId: eventId || '',
    authorPubkey,
    kind,
    identifier,
  })
  const displaySats = eventId ? totalSats : 0

  const isOwnContent = user?.pubkey === authorPubkey

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
      }
    }
  }, [])

  const handleQuickZap = useCallback(async () => {
    if (isLongPress.current) return
    // Capture timestamp at the moment of click
    setCapturedTimestamp(currentTime)
    // If wallet is connected, do quick zap; otherwise open dialog for QR code
    if (isConnected) {
      await zap({ timestamp: currentTime })
    } else {
      setShowZapDialog(true)
    }
  }, [zap, isConnected, currentTime])

  const handlePointerDown = useCallback(() => {
    isLongPress.current = false
    // Capture timestamp at the moment of press
    setCapturedTimestamp(currentTime)
    longPressTimer.current = window.setTimeout(() => {
      isLongPress.current = true
      setShowZapDialog(true)
    }, LONG_PRESS_DELAY)
  }, [currentTime])

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handlePointerLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      // Capture timestamp at the moment of right-click
      setCapturedTimestamp(currentTime)
      setShowZapDialog(true)
    },
    [currentTime]
  )

  const handleZapFromDialog = useCallback(
    async (amount: number, comment?: string, timestamp?: number) => {
      return zap({ amount, comment, timestamp })
    },
    [zap]
  )

  if (layout === 'inline') {
    // Render static display for own content or when not logged in
    if (isOwnContent || !user) {
      return (
        <div className={cn('inline-flex items-center gap-1 p-2 text-muted-foreground', className)}>
          <Zap className={cn('h-5 w-5', displaySats > 0 && 'text-yellow-500')} />
          <span className="ml-1 md:ml-2">{formatSats(displaySats)}</span>
        </div>
      )
    }

    return (
      <>
        <Button
          variant="secondary"
          className={cn(className)}
          onClick={handleQuickZap}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onContextMenu={handleContextMenu}
          disabled={!user || isZapping}
          aria-label="Zap"
        >
          {isZapping ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Zap className={cn('h-5 w-5', displaySats > 0 && 'text-yellow-500')} />
          )}
          <span className="ml-1 md:ml-2">{formatSats(displaySats)}</span>
        </Button>

        <ZapDialog
          open={showZapDialog}
          onOpenChange={setShowZapDialog}
          eventId={eventId}
          authorPubkey={authorPubkey}
          onZap={handleZapFromDialog}
          isZapping={isZapping}
          isWalletConnected={isConnected}
          generateInvoice={generateInvoice}
          timestamp={capturedTimestamp}
        />
      </>
    )
  }

  // Vertical layout (for Shorts)
  // Render static display for own content or when not logged in
  if (isOwnContent || !user) {
    return (
      <div className={cn('flex flex-col items-center gap-1', className)}>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Zap className={cn('h-5 w-5', displaySats > 0 && 'text-yellow-500')} />
        </div>
        <span className="text-sm font-medium">{formatSats(displaySats)}</span>
      </div>
    )
  }

  return (
    <>
      <div className={cn('flex flex-col items-center gap-1', className)}>
        <Button
          variant="secondary"
          size="icon"
          className="rounded-full"
          onClick={handleQuickZap}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onContextMenu={handleContextMenu}
          disabled={!user || isZapping}
          aria-label="Zap"
        >
          {isZapping ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Zap className={cn('h-5 w-5', displaySats > 0 && 'text-yellow-500')} />
          )}
        </Button>
        <span className="text-sm font-medium">{formatSats(displaySats)}</span>
      </div>

      <ZapDialog
        open={showZapDialog}
        onOpenChange={setShowZapDialog}
        eventId={eventId}
        authorPubkey={authorPubkey}
        onZap={handleZapFromDialog}
        isZapping={isZapping}
        isWalletConnected={isConnected}
        generateInvoice={generateInvoice}
        timestamp={capturedTimestamp}
      />
    </>
  )
})
