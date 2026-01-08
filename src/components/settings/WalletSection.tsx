import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWalletContext } from '@/contexts/WalletContext'
import { formatSats } from '@/lib/zap-utils'
import { useCurrentUser } from '@/hooks'
import {
  Loader2,
  Zap,
  ExternalLink,
  Wallet,
  Plus,
  Lock,
  Unlock,
  Coins,
  Radio,
  ChevronsUpDown,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

// Default Cashu mints
const DEFAULT_CASHU_MINTS = [
  'https://mint.minibits.cash/Bitcoin',
  'https://mint.coinos.io',
  'https://mint.lnbits.com/cashu/api/v1/AptDNRABH9w6QrWcREZ9Pb',
]

export function WalletSection() {
  const { t } = useTranslation()
  const currentUser = useCurrentUser()
  const [nwcConnectionString, setNwcConnectionString] = useState('')
  const [newMintUrl, setNewMintUrl] = useState('')
  const [selectedMints, setSelectedMints] = useState<string[]>([DEFAULT_CASHU_MINTS[0]])
  const [mintPopoverOpen, setMintPopoverOpen] = useState(false)

  const {
    walletType,
    isConnected,
    isConnecting,
    isUnlocking,
    balance,
    walletInfo,
    error,
    cashuMints,
    cashuWalletEvent,
    connectNWC,
    createCashuWallet,
    unlockCashuWallet,
    addCashuMint,
    disconnect,
    refreshBalance,
  } = useWalletContext()

  const handleConnectNWC = useCallback(async () => {
    try {
      await connectNWC(nwcConnectionString.trim())
      setNwcConnectionString('')
    } catch {
      // Error handled by context
    }
  }, [connectNWC, nwcConnectionString])

  const handleKeyDownNWC = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && nwcConnectionString.trim()) {
        handleConnectNWC()
      }
    },
    [nwcConnectionString, handleConnectNWC]
  )

  const handleCreateCashuWallet = useCallback(async () => {
    if (selectedMints.length === 0) return
    try {
      await createCashuWallet(selectedMints)
    } catch {
      // Error handled by context
    }
  }, [createCashuWallet, selectedMints])

  const handleAddMint = useCallback(
    async (mintUrl?: string) => {
      const url = mintUrl || newMintUrl.trim()
      if (!url) return
      try {
        await addCashuMint(url)
        setNewMintUrl('')
        setMintPopoverOpen(false)
      } catch {
        // Error handled by context
      }
    },
    [addCashuMint, newMintUrl]
  )

  const toggleMintSelection = useCallback((mintUrl: string) => {
    setSelectedMints(prev =>
      prev.includes(mintUrl) ? prev.filter(m => m !== mintUrl) : [...prev, mintUrl]
    )
  }, [])

  // Render connected wallet state
  if (isConnected && walletType) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('wallet.description')}</p>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                {walletType === 'nwc' ? (
                  <Radio className="h-4 w-4 text-yellow-500" />
                ) : (
                  <Coins className="h-4 w-4 text-purple-500" />
                )}
                <CardTitle className="text-base">
                  {walletType === 'nwc'
                    ? walletInfo?.alias || 'Lightning Wallet (NWC)'
                    : 'Cashu Wallet (NIP-60)'}
                </CardTitle>
              </div>
              <Button variant="outline" size="sm" onClick={disconnect}>
                Disconnect
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {balance !== null && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Zap className="h-4 w-4 text-yellow-500" />
                <span>
                  Balance: {formatSats(Math.floor(walletType === 'nwc' ? balance / 1000 : balance))}{' '}
                  sats
                </span>
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={refreshBalance}>
                  Refresh
                </Button>
              </div>
            )}

            {/* Cashu-specific: Show mints and balances */}
            {walletType === 'cashu' && cashuMints.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Mints</Label>
                <div className="space-y-1">
                  {cashuMints.map(mint => (
                    <div
                      key={mint.url}
                      className="flex items-center justify-between rounded bg-muted/50 px-2 py-1 text-sm"
                    >
                      <span className="truncate font-mono text-xs">{mint.url}</span>
                      <span className="text-muted-foreground">{formatSats(mint.balance)} sats</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cashu: Unlock wallet if locked */}
            {walletType === 'cashu' && cashuWalletEvent && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={unlockCashuWallet}
                  disabled={isUnlocking}
                >
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
            )}

            {/* Cashu: Add new mint */}
            {walletType === 'cashu' && (
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs">Add Mint</Label>
                <Popover open={mintPopoverOpen} onOpenChange={setMintPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={mintPopoverOpen}
                      className="w-full justify-between text-sm font-normal"
                    >
                      <span className="truncate text-muted-foreground">
                        {newMintUrl || 'Select or enter a mint URL...'}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] p-0"
                    align="start"
                  >
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Enter mint URL..."
                        value={newMintUrl}
                        onValueChange={setNewMintUrl}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {newMintUrl.trim() ? (
                            <Button
                              variant="ghost"
                              className="w-full justify-start"
                              onClick={() => handleAddMint()}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Add "{newMintUrl}"
                            </Button>
                          ) : (
                            'Enter a mint URL'
                          )}
                        </CommandEmpty>
                        <CommandGroup heading="Popular Mints">
                          {DEFAULT_CASHU_MINTS.filter(
                            mint => !cashuMints.some(m => m.url === mint)
                          ).map(mint => (
                            <CommandItem
                              key={mint}
                              value={mint}
                              onSelect={() => handleAddMint(mint)}
                              className="cursor-pointer"
                            >
                              <span className="truncate font-mono text-xs">{mint}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // Render disconnected state with wallet type selection
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('wallet.description')}</p>

      <Tabs defaultValue="nwc" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="nwc" className="flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Lightning (NWC)
          </TabsTrigger>
          <TabsTrigger value="cashu" className="flex items-center gap-2" disabled={!currentUser}>
            <Coins className="h-4 w-4" />
            Cashu (NIP-60)
          </TabsTrigger>
        </TabsList>

        {/* NWC Tab */}
        <TabsContent value="nwc" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nostr Wallet Connect</CardTitle>
              <CardDescription>
                Connect to a Lightning wallet using NIP-47. Works with Alby, Mutiny, and other
                NWC-compatible wallets.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nwc-settings">NWC Connection String</Label>
                <Input
                  id="nwc-settings"
                  placeholder="nostr+walletconnect://..."
                  value={nwcConnectionString}
                  onChange={e => setNwcConnectionString(e.target.value)}
                  onKeyDown={handleKeyDownNWC}
                  disabled={isConnecting}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>

              <div className="flex items-center justify-between">
                <a
                  href="https://nwc.getalby.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  Get NWC from Alby
                  <ExternalLink className="h-3 w-3" />
                </a>

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
                    <>
                      <Wallet className="mr-2 h-4 w-4" />
                      Connect
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cashu Tab */}
        <TabsContent value="cashu" className="space-y-4">
          {!currentUser ? (
            <Card>
              <CardContent className="py-6">
                <div className="flex flex-col items-center gap-2 text-center">
                  <Lock className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Please log in to create or connect a Cashu wallet.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : cashuWalletEvent ? (
            // Existing Cashu wallet found
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Existing Wallet Found</CardTitle>
                <CardDescription>
                  You have a NIP-60 Cashu wallet. Unlock it to view your balance and make payments.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={unlockCashuWallet} disabled={isUnlocking} className="w-full">
                  {isUnlocking ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Unlocking...
                    </>
                  ) : (
                    <>
                      <Unlock className="mr-2 h-4 w-4" />
                      Unlock Cashu Wallet
                    </>
                  )}
                </Button>
                {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
              </CardContent>
            </Card>
          ) : (
            // Create new Cashu wallet
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Create Cashu Wallet</CardTitle>
                <CardDescription>
                  Create a self-custodial e-cash wallet stored on Nostr relays (NIP-60). Select one
                  or more mints to use.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm">Select Mints</Label>
                  <div className="space-y-2">
                    {DEFAULT_CASHU_MINTS.map(mint => (
                      <label
                        key={mint}
                        className="flex items-center gap-2 rounded border p-2 cursor-pointer hover:bg-muted/50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedMints.includes(mint)}
                          onChange={() => toggleMintSelection(mint)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <span className="truncate font-mono text-xs">{mint}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="custom-mint" className="text-sm">
                    Or add a custom mint
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="custom-mint"
                      placeholder="https://mint.example.com"
                      value={newMintUrl}
                      onChange={e => setNewMintUrl(e.target.value)}
                      className="flex-1 text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (newMintUrl.trim() && !selectedMints.includes(newMintUrl.trim())) {
                          setSelectedMints(prev => [...prev, newMintUrl.trim()])
                          setNewMintUrl('')
                        }
                      }}
                      disabled={!newMintUrl.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button
                  onClick={handleCreateCashuWallet}
                  disabled={selectedMints.length === 0 || isConnecting}
                  className="w-full"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Wallet...
                    </>
                  ) : (
                    <>
                      <Coins className="mr-2 h-4 w-4" />
                      Create Cashu Wallet
                    </>
                  )}
                </Button>

                <p className="text-xs text-muted-foreground">
                  Your wallet keys will be encrypted and stored on Nostr relays. Only you can access
                  your funds.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
