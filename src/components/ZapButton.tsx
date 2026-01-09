import { useState, useRef, useEffect, useCallback, memo } from 'react'
import { Button } from '@/components/ui/button'
import { Zap, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useZap, useEventZaps, useCurrentUser } from '@/hooks'
import { formatSats } from '@/lib/zap-utils'
import { ZapDialog } from './ZapDialog'

interface ZapButtonProps {
  eventId: string
  kind: number
  authorPubkey: string
  layout?: 'vertical' | 'inline'
  className?: string
}

const LONG_PRESS_DELAY = 500

export const ZapButton = memo(function ZapButton({
  eventId,
  kind,
  authorPubkey,
  layout = 'vertical',
  className = '',
}: ZapButtonProps) {
  const [showZapDialog, setShowZapDialog] = useState(false)
  const longPressTimer = useRef<number | null>(null)
  const isLongPress = useRef(false)

  const { user } = useCurrentUser()
  const { zap, generateInvoice, isZapping, isConnected } = useZap({
    eventId,
    authorPubkey,
  })
  const { totalSats } = useEventZaps(eventId, authorPubkey)

  const isOwnContent = user?.pubkey === authorPubkey

  // kind is available for future use but not currently needed
  void kind

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
    // If wallet is connected, do quick zap; otherwise open dialog for QR code
    if (isConnected) {
      await zap()
    } else {
      setShowZapDialog(true)
    }
  }, [zap, isConnected])

  const handlePointerDown = useCallback(() => {
    isLongPress.current = false
    longPressTimer.current = window.setTimeout(() => {
      isLongPress.current = true
      setShowZapDialog(true)
    }, LONG_PRESS_DELAY)
  }, [])

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

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setShowZapDialog(true)
  }, [])

  const handleZapFromDialog = useCallback(
    async (amount: number, comment?: string) => {
      return zap(amount, comment)
    },
    [zap]
  )

  if (layout === 'inline') {
    // Render static display for own content or when not logged in
    if (isOwnContent || !user) {
      return (
        <div className={cn('inline-flex items-center gap-1 p-2 text-muted-foreground', className)}>
          <Zap className={cn('h-5 w-5', totalSats > 0 && 'text-yellow-500')} />
          <span className="ml-1 md:ml-2">{formatSats(totalSats)}</span>
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
            <Zap className={cn('h-5 w-5', totalSats > 0 && 'text-yellow-500')} />
          )}
          <span className="ml-1 md:ml-2">{formatSats(totalSats)}</span>
        </Button>

        <ZapDialog
          open={showZapDialog}
          onOpenChange={setShowZapDialog}
          authorPubkey={authorPubkey}
          onZap={handleZapFromDialog}
          isZapping={isZapping}
          isWalletConnected={isConnected}
          generateInvoice={generateInvoice}
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
          <Zap className={cn('h-5 w-5', totalSats > 0 && 'text-yellow-500')} />
        </div>
        <span className="text-sm font-medium">{formatSats(totalSats)}</span>
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
            <Zap className={cn('h-5 w-5', totalSats > 0 && 'text-yellow-500')} />
          )}
        </Button>
        <span className="text-sm font-medium">{formatSats(totalSats)}</span>
      </div>

      <ZapDialog
        open={showZapDialog}
        onOpenChange={setShowZapDialog}
        authorPubkey={authorPubkey}
        onZap={handleZapFromDialog}
        isZapping={isZapping}
        isWalletConnected={isConnected}
        generateInvoice={generateInvoice}
      />
    </>
  )
})
