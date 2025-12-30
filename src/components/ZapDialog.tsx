import { useState, useCallback, memo } from 'react'
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
import { UserAvatar } from '@/components/UserAvatar'
import { useProfile } from '@/hooks'
import { Loader2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

const PRESET_AMOUNTS = [21, 100, 500, 1000, 5000]

interface ZapDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  authorPubkey: string
  onZap: (amount: number, comment?: string) => Promise<boolean>
  isZapping: boolean
}

export const ZapDialog = memo(function ZapDialog({
  open,
  onOpenChange,
  authorPubkey,
  onZap,
  isZapping,
}: ZapDialogProps) {
  const [selectedAmount, setSelectedAmount] = useState<number>(100)
  const [customAmount, setCustomAmount] = useState('')
  const [comment, setComment] = useState('')
  const profile = useProfile({ pubkey: authorPubkey })

  const displayName = profile?.display_name || profile?.name || authorPubkey.slice(0, 8)
  const avatar = profile?.picture

  const effectiveAmount = customAmount ? parseInt(customAmount, 10) : selectedAmount

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
    const success = await onZap(effectiveAmount, comment || undefined)
    if (success) {
      onOpenChange(false)
      setComment('')
      setCustomAmount('')
      setSelectedAmount(100)
    }
  }, [effectiveAmount, comment, onZap, onOpenChange])

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

          {/* Zap button */}
          <Button
            className="w-full"
            onClick={handleZap}
            disabled={effectiveAmount < 1 || isZapping}
          >
            {isZapping ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Zapping...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Zap {effectiveAmount} sats
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
})
