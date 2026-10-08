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
import { Label } from '@/components/ui/label'
import { useWalletContext } from '@/contexts/WalletContext'
import { useCurrentUser } from '@/hooks'
import { Loader2, ExternalLink, Radio, Coins, Lock, Unlock } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// Default Cashu mints
const DEFAULT_CASHU_MINTS = ['https://mint.minibits.cash/Bitcoin', 'https://mint.coinos.io']

interface WalletConnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected?: () => void
}

export const WalletConnectDialog = memo(function WalletConnectDialog({
  open,
  onOpenChange,
  onConnected,
}: WalletConnectDialogProps) {
  const currentUser = useCurrentUser()
  const [nwcConnectionString, setNwcConnectionString] = useState('')
  const [selectedMint, setSelectedMint] = useState(DEFAULT_CASHU_MINTS[0])

  const {
    connectNWC,
    createCashuWallet,
    unlockCashuWallet,
    isConnecting,
    isUnlocking,
    error,
    cashuWalletEvent,
  } = useWalletContext()

  const handleConnectNWC = useCallback(async () => {
    try {
      await connectNWC(nwcConnectionString.trim())
      onOpenChange(false)
      onConnected?.()
    } catch {
      // Error is handled by context
    }
  }, [connectNWC, nwcConnectionString, onOpenChange, onConnected])

  const handleCreateCashuWallet = useCallback(async () => {
    try {
      await createCashuWallet([selectedMint])
      onOpenChange(false)
      onConnected?.()
    } catch {
      // Error is handled by context
    }
  }, [createCashuWallet, selectedMint, onOpenChange, onConnected])

  const handleUnlockCashuWallet = useCallback(async () => {
    try {
      await unlockCashuWallet()
      onOpenChange(false)
      onConnected?.()
    } catch {
      // Error is handled by context
    }
  }, [unlockCashuWallet, onOpenChange, onConnected])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && nwcConnectionString.trim()) {
        handleConnectNWC()
      }
    },
    [nwcConnectionString, handleConnectNWC]
  )

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNwcConnectionString(e.target.value)
  }, [])

  const handleCancel = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
          <DialogDescription>
            Connect a wallet to send zaps. Choose between Lightning (NWC) or Cashu (NIP-60).
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="nwc" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="nwc" className="flex items-center gap-1.5 text-xs">
              <Radio className="h-3.5 w-3.5" />
              Lightning
            </TabsTrigger>
            <TabsTrigger
              value="cashu"
              className="flex items-center gap-1.5 text-xs"
              disabled={!currentUser}
            >
              <Coins className="h-3.5 w-3.5" />
              Cashu
            </TabsTrigger>
          </TabsList>

          {/* NWC Tab */}
          <TabsContent value="nwc" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="nwc-uri">NWC Connection String</Label>
              <Input
                id="nwc-uri"
                placeholder="nostr+walletconnect://..."
                value={nwcConnectionString}
                onChange={handleInputChange}
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
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                onClick={handleConnectNWC}
                disabled={!nwcConnectionString.trim() || isConnecting}
              >
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
          </TabsContent>

          {/* Cashu Tab */}
          <TabsContent value="cashu" className="space-y-4 mt-4">
            {!currentUser ? (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <Lock className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Please log in to use a Cashu wallet.
                </p>
              </div>
            ) : cashuWalletEvent ? (
              // Existing wallet - offer to unlock
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  You have an existing Cashu wallet. Unlock it to continue.
                </p>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button onClick={handleUnlockCashuWallet} disabled={isUnlocking}>
                    {isUnlocking ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Unlocking...
                      </>
                    ) : (
                      <>
                        <Unlock className="mr-2 h-4 w-4" />
                        Unlock Wallet
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              // Create new wallet
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm">Select a Mint</Label>
                  <div className="space-y-2">
                    {DEFAULT_CASHU_MINTS.map(mint => (
                      <label
                        key={mint}
                        className="flex items-center gap-2 rounded border p-2 cursor-pointer hover:bg-muted/50"
                      >
                        <input
                          type="radio"
                          name="mint"
                          checked={selectedMint === mint}
                          onChange={() => setSelectedMint(mint)}
                          className="h-4 w-4"
                        />
                        <span className="truncate font-mono text-xs">{mint}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <p className="text-xs text-muted-foreground">
                  Creates a self-custodial e-cash wallet stored on Nostr relays.
                </p>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateCashuWallet} disabled={isConnecting}>
                    {isConnecting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Coins className="mr-2 h-4 w-4" />
                        Create Wallet
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
})
