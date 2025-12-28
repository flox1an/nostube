import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Zap, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useZap, useVideoZaps, useCurrentUser } from '@/hooks'
import { formatSats } from '@/lib/zap-utils'
import { ZapDialog } from './ZapDialog'
import { WalletConnectDialog } from './WalletConnectDialog'

interface ZapButtonProps {
  eventId: string
  kind: number
  authorPubkey: string
  layout?: 'vertical' | 'inline'
  className?: string
}

const LONG_PRESS_DELAY = 500

export function ZapButton({
  eventId,
  kind,
  authorPubkey,
  layout = 'vertical',
  className = '',
}: ZapButtonProps) {
  const [showZapDialog, setShowZapDialog] = useState(false)
  const [showWalletDialog, setShowWalletDialog] = useState(false)
  const longPressTimer = useRef<number | null>(null)
  const isLongPress = useRef(false)

  const { user } = useCurrentUser()
  const { zap, isZapping, needsWallet, setNeedsWallet } = useZap({
    eventId,
    eventKind: kind,
    authorPubkey,
  })
  const { totalSats } = useVideoZaps(eventId, authorPubkey)

  const isOwnContent = user?.pubkey === authorPubkey

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current)
      }
    }
  }, [])

  // Show wallet dialog when needed
  useEffect(() => {
    if (needsWallet && !showWalletDialog) {
      setShowWalletDialog(true)
      setNeedsWallet(false)
    }
  }, [needsWallet, showWalletDialog, setNeedsWallet])

  const handleQuickZap = async () => {
    if (isLongPress.current) return
    await zap()
  }

  const handlePointerDown = () => {
    isLongPress.current = false
    longPressTimer.current = window.setTimeout(() => {
      isLongPress.current = true
      setShowZapDialog(true)
    }, LONG_PRESS_DELAY)
  }

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handlePointerLeave = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setShowZapDialog(true)
  }

  const handleZapFromDialog = async (amount: number, comment?: string) => {
    return zap(amount, comment)
  }

  const handleWalletConnected = () => {
    // Retry the pending zap if there was one
  }

  if (layout === 'inline') {
    return (
      <>
        <Button
          variant="secondary"
          className={className}
          onClick={handleQuickZap}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onContextMenu={handleContextMenu}
          disabled={!user || isZapping || isOwnContent}
          aria-label="Zap"
        >
          {isZapping ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Zap className={cn('h-5 w-5', totalSats > 0 && 'text-yellow-500')} />
          )}
          <span className="ml-2">{formatSats(totalSats)}</span>
        </Button>

        <ZapDialog
          open={showZapDialog}
          onOpenChange={setShowZapDialog}
          authorPubkey={authorPubkey}
          onZap={handleZapFromDialog}
          isZapping={isZapping}
        />

        <WalletConnectDialog
          open={showWalletDialog}
          onOpenChange={setShowWalletDialog}
          onConnected={handleWalletConnected}
        />
      </>
    )
  }

  // Vertical layout (for Shorts)
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
          disabled={!user || isZapping || isOwnContent}
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
      />

      <WalletConnectDialog
        open={showWalletDialog}
        onOpenChange={setShowWalletDialog}
        onConnected={handleWalletConnected}
      />
    </>
  )
}
