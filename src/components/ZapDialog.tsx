import { useState, useCallback, memo, useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Link } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { UserAvatar } from '@/components/UserAvatar'
import { useProfile, useEventZaps } from '@/hooks'
import { Loader2, Zap, Copy, Check, Settings, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const PRESET_AMOUNTS = [21, 100, 500, 1000, 5000]

// Format seconds as mm:ss or h:mm:ss
function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

interface ZapDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId?: string // Optional - not provided when zapping a profile directly
  authorPubkey: string
  onZap: (amount: number, comment?: string, timestamp?: number) => Promise<boolean>
  isZapping: boolean
  isWalletConnected: boolean
  generateInvoice?: (amount: number, comment?: string, timestamp?: number) => Promise<string | null>
  timestamp?: number // Video timestamp in seconds (for timestamped zaps)
}

export const ZapDialog = memo(function ZapDialog({
  open,
  onOpenChange,
  eventId,
  authorPubkey,
  onZap,
  isZapping,
  isWalletConnected,
  generateInvoice,
  timestamp,
}: ZapDialogProps) {
  const [selectedAmount, setSelectedAmount] = useState<number>(100)
  const [customAmount, setCustomAmount] = useState('')
  const [comment, setComment] = useState('')
  const [invoice, setInvoice] = useState<string | null>(null)
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false)
  const [copied, setCopied] = useState(false)
  const [includeTimestamp, setIncludeTimestamp] = useState(true)
  const profile = useProfile({ pubkey: authorPubkey })

  // Track if we've already handled this invoice's payment
  const handledInvoiceRef = useRef<string | null>(null)

  // Watch for zap receipts when we have an invoice (only for event zaps, not profile zaps)
  const { zaps } = useEventZaps(eventId || '', authorPubkey)

  const displayName = profile?.display_name || profile?.name || authorPubkey.slice(0, 8)
  const avatar = profile?.picture

  const effectiveAmount = customAmount ? parseInt(customAmount, 10) : selectedAmount

  // Reset state when dialog closes/opens
  useEffect(() => {
    if (!open) {
      setInvoice(null)
      setCopied(false)
      handledInvoiceRef.current = null
    } else {
      // Reset timestamp checkbox to checked when dialog opens
      setIncludeTimestamp(true)
    }
  }, [open])

  // Watch for zap receipt matching our invoice (only works for event zaps with eventId)
  useEffect(() => {
    // Skip if no eventId (profile zaps don't have zap receipt detection)
    if (!eventId) return
    if (!invoice || !zaps || zaps.length === 0) return
    // Don't handle the same invoice twice
    if (handledInvoiceRef.current === invoice) return

    // Check if any zap receipt has our invoice
    const matchingZap = zaps.find(zap => {
      const bolt11Tag = zap.tags.find(t => t[0] === 'bolt11')
      const bolt11 = bolt11Tag?.[1]
      // Compare case-insensitively since bolt11 can vary in case
      return bolt11?.toLowerCase() === invoice.toLowerCase()
    })

    if (matchingZap) {
      handledInvoiceRef.current = invoice
      toast.success(`Zapped ${effectiveAmount} sats!`)
      onOpenChange(false)
      setComment('')
      setCustomAmount('')
      setSelectedAmount(100)
    }
  }, [eventId, invoice, zaps, effectiveAmount, onOpenChange])

  const handlePresetClick = useCallback((amount: number) => {
    setSelectedAmount(amount)
    setCustomAmount('')
  }, [])

  const handleCustomChange = useCallback((value: string) => {
    // Only allow digits
    const cleaned = value.replace(/\D/g, '')
    setCustomAmount(cleaned)
    if (cleaned) {
      setSelectedAmount(0) // Deselect presets
    }
  }, [])

  const handleCommentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setComment(e.target.value.slice(0, 140))
  }, [])

  const handleZap = useCallback(async () => {
    if (effectiveAmount < 1) return

    // Only include timestamp if checkbox is checked
    const effectiveTimestamp = includeTimestamp ? timestamp : undefined

    // If wallet is connected, use the normal zap flow
    if (isWalletConnected) {
      const success = await onZap(effectiveAmount, comment || undefined, effectiveTimestamp)
      if (success) {
        onOpenChange(false)
        setComment('')
        setCustomAmount('')
        setSelectedAmount(100)
      }
      return
    }

    // No wallet - generate invoice and show QR code
    if (!generateInvoice) return

    setIsGeneratingInvoice(true)
    try {
      const bolt11 = await generateInvoice(
        effectiveAmount,
        comment || undefined,
        effectiveTimestamp
      )
      if (bolt11) {
        setInvoice(bolt11)
      }
    } finally {
      setIsGeneratingInvoice(false)
    }
  }, [
    effectiveAmount,
    comment,
    onZap,
    onOpenChange,
    isWalletConnected,
    generateInvoice,
    timestamp,
    includeTimestamp,
  ])

  const handleCopyInvoice = useCallback(async () => {
    if (!invoice) return
    try {
      await navigator.clipboard.writeText(invoice)
      setCopied(true)
      toast.success('Invoice copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy invoice')
    }
  }, [invoice])

  const handleBack = useCallback(() => {
    setInvoice(null)
    setCopied(false)
  }, [])

  // Show QR code view when invoice is generated (no wallet mode)
  if (invoice) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Pay Invoice
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 pt-2">
              <span>Scan with your lightning wallet to zap {effectiveAmount} sats</span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center space-y-4">
            {/* QR Code */}
            <div className="p-4 bg-white rounded-xl">
              <QRCodeSVG value={invoice.toUpperCase()} size={200} level="M" includeMargin={false} />
            </div>

            {/* Copy button */}
            <Button variant="outline" onClick={handleCopyInvoice} className="w-full">
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Invoice
                </>
              )}
            </Button>

            {/* Separator */}
            <div className="w-full flex items-center gap-2 text-sm text-muted-foreground">
              <div className="flex-1 border-t" />
              <span>or</span>
              <div className="flex-1 border-t" />
            </div>

            {/* Configure wallet link */}
            <Link
              to="/settings/wallet"
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Settings className="h-4 w-4" />
              Configure wallet for one-tap zaps
            </Link>

            {/* Back button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="text-muted-foreground"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Change amount
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Send Zap
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 pt-2">
            <UserAvatar
              picture={avatar}
              pubkey={authorPubkey}
              name={displayName}
              className="h-6 w-6"
            />
            <span>to {displayName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preset amounts */}
          <div className="space-y-2">
            <Label>Amount (sats)</Label>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_AMOUNTS.map(amount => (
                <Button
                  key={amount}
                  variant={selectedAmount === amount && !customAmount ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handlePresetClick(amount)}
                  className={cn(
                    'text-xs',
                    selectedAmount === amount && !customAmount && 'ring-2 ring-primary'
                  )}
                >
                  {amount}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom amount */}
          <div className="space-y-2">
            <Label htmlFor="custom-amount">Custom amount</Label>
            <div className="relative">
              <Input
                id="custom-amount"
                placeholder="Enter amount"
                value={customAmount}
                onChange={e => handleCustomChange(e.target.value)}
                className="pr-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                sats
              </span>
            </div>
          </div>

          {/* Comment */}
          <div className="space-y-2">
            <Label htmlFor="zap-comment">Comment (optional)</Label>
            <Textarea
              id="zap-comment"
              placeholder="Add a message..."
              value={comment}
              onChange={handleCommentChange}
              maxLength={140}
              rows={2}
            />
            <p className="text-right text-xs text-muted-foreground">{comment.length}/140</p>
          </div>

          {/* Timestamp checkbox (only shown when timestamp is available) */}
          {timestamp !== undefined && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-timestamp"
                checked={includeTimestamp}
                onCheckedChange={checked => setIncludeTimestamp(checked === true)}
              />
              <Label htmlFor="include-timestamp" className="text-sm font-normal cursor-pointer">
                at play position {formatTimestamp(timestamp)}
              </Label>
            </div>
          )}

          {/* Zap button */}
          <Button
            className="w-full"
            onClick={handleZap}
            disabled={effectiveAmount < 1 || isZapping || isGeneratingInvoice}
          >
            {isZapping || isGeneratingInvoice ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isGeneratingInvoice ? 'Getting invoice...' : 'Zapping...'}
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Zap {effectiveAmount} sats
              </>
            )}
          </Button>

          {/* Configure wallet hint when no wallet */}
          {!isWalletConnected && (
            <p className="text-center text-xs text-muted-foreground">
              No wallet configured.{' '}
              <Link
                to="/settings/wallet"
                onClick={() => onOpenChange(false)}
                className="text-primary hover:underline"
              >
                Set up wallet
              </Link>{' '}
              for one-tap zaps.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
})
