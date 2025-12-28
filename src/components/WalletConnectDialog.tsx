import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWallet } from '@/hooks'
import { Loader2, ExternalLink } from 'lucide-react'

interface WalletConnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected?: () => void
}

export function WalletConnectDialog({ open, onOpenChange, onConnected }: WalletConnectDialogProps) {
  const [connectionString, setConnectionString] = useState('')
  const { connect, isConnecting, error } = useWallet()

  const handleConnect = async () => {
    try {
      await connect(connectionString.trim())
      onOpenChange(false)
      onConnected?.()
    } catch {
      // Error is handled by context
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && connectionString.trim()) {
      handleConnect()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Lightning Wallet</DialogTitle>
          <DialogDescription>
            Connect your wallet using Nostr Wallet Connect (NWC) to send zaps.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nwc-uri">NWC Connection String</Label>
            <Input
              id="nwc-uri"
              placeholder="nostr+walletconnect://..."
              value={connectionString}
              onChange={e => setConnectionString(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isConnecting}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <a
              href="https://nwc.getalby.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              Get NWC from Alby
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleConnect} disabled={!connectionString.trim() || isConnecting}>
              {isConnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
